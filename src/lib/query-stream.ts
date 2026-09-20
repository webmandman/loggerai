/**
 * Getting the supporting-entry list out of a streamed answer.
 *
 * The model writes prose, then a marker line, then a JSON array of the entry
 * ids it drew on. That shape stays: the thing writing the answer is the only
 * thing that knows which entries went into it, and no independent relevance
 * pass over the same entries would be answering that question. What changes is
 * the handling, which had two real defects and one silent one.
 *
 *  - A marker split across two stream chunks was not recognised, so the first
 *    half — "---ENT" — was forwarded to the reader and appeared in the answer.
 *    `splitStream` holds back any suffix that could still become the marker.
 *
 *  - A chunk carrying the last words of the answer AND the marker was dropped
 *    whole, taking those words with it. `splitStream` emits the part before
 *    the marker and stops there.
 *
 *  - A missing or unparseable tail meant an empty id list and no sign that
 *    anything had gone wrong: the answer appeared with no entries under it,
 *    exactly as if none were relevant. That is now distinguishable, and the
 *    caller asks for the list instead of shrugging.
 *
 * Relative imports and a type-only `@/types`-style import keep this loadable
 * under the bare `node --test` run, same as the other lib files.
 */
import { TypeSafeClient, noul, type NoulQuestion } from "@typesafe-ai/sdk";

export const ID_MARKER = "---ENTRY_IDS---";

export interface StreamSplit {
  /** Safe to send to the reader now. */
  emit: string;
  /** Undecided: it could still turn out to be the start of the marker. */
  hold: string;
  /** Everything after the marker, once the marker has been seen. */
  tail: string | null;
}

/**
 * How many trailing characters could still become the marker.
 *
 * "...in September.\n---ENT" ends in a prefix of the marker, so those seven
 * characters have to wait for the next chunk before anyone can say whether
 * they are text or punctuation. Everything before them is safe.
 */
function undecidedSuffix(text: string): number {
  const most = Math.min(ID_MARKER.length - 1, text.length);
  for (let k = most; k > 0; k--) {
    if (text.endsWith(ID_MARKER.slice(0, k))) return k;
  }
  return 0;
}

/**
 * Decide what of the buffered text can be shown.
 *
 * `pending` is whatever was held back last time plus the chunk that just
 * arrived. Call with `atEnd` once the stream is finished, which releases the
 * held text — at that point nothing more is coming, so a dangling "---" is
 * just a dangling "---".
 */
export function splitStream(pending: string, atEnd = false): StreamSplit {
  const at = pending.indexOf(ID_MARKER);

  if (at !== -1) {
    return {
      emit: pending.slice(0, at),
      hold: "",
      tail: pending.slice(at + ID_MARKER.length),
    };
  }

  if (atEnd) return { emit: pending, hold: "", tail: null };

  const undecided = undecidedSuffix(pending);
  return {
    emit: pending.slice(0, pending.length - undecided),
    hold: pending.slice(pending.length - undecided),
    tail: null,
  };
}

/**
 * Read the id array out of the tail, keeping only ids that were actually on
 * offer.
 *
 * Returns null when there is nothing to read — no marker, or a tail that will
 * not parse — which is different from an empty array. An empty array is the
 * model saying none of the entries are relevant, and that is an answer. Null
 * means we never got one, and the caller goes and finds out.
 */
export function parseEntryIds(
  tail: string | null,
  candidates: Iterable<string>
): string[] | null {
  if (tail === null) return null;

  const trimmed = tail.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  const raw = (fenced ? fenced[1] : trimmed).trim();
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  // Ids the model made up are dropped rather than sent to the batch endpoint,
  // where they would come back as nothing anyway.
  const offered = new Set(candidates);
  return [...new Set(parsed.filter((id): id is string => typeof id === "string"))].filter(
    (id) => offered.has(id)
  );
}

/** One entry, as the attribution pass needs to see it. */
export interface Candidate {
  id: string;
  summary: string;
  when: string;
}

/**
 * How many entries go into one request. The whole set is asked about, in
 * parallel chunks, rather than truncated — "what did I do in January" must not
 * lose January because it fell outside the first batch.
 */
const CHUNK = 25;

let client: TypeSafeClient | null = null;

/** Built on first use, not at import: the constructor throws without a key,
 *  and this whole path is already a recovery from something else going wrong. */
function getClient(): TypeSafeClient {
  client ??= new TypeSafeClient({ timeout: 8000, retry: { maxRetries: 1 } });
  return client;
}

/**
 * Work out which entries an answer was built from, by reading the answer.
 *
 * Only runs when the model did not tell us — a dropped marker, a tail that
 * will not parse, or an answer cut off at max_tokens before it got that far.
 * It is asking about the finished answer rather than about the question, which
 * is the same thing the marker was reporting: not "is this entry relevant" but
 * "did this answer come from here".
 *
 * Best effort by design. On failure the caller shows the answer with no
 * entries under it, which is what happened every time before this existed.
 */
export async function attributeEntries(
  answer: string,
  candidates: Candidate[]
): Promise<string[]> {
  if (!answer.trim() || candidates.length === 0) return [];

  const chunks: Candidate[][] = [];
  for (let i = 0; i < candidates.length; i += CHUNK) {
    chunks.push(candidates.slice(i, i + CHUNK));
  }

  try {
    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const questions: Record<string, NoulQuestion> = {};
        chunk.forEach((_, i) => {
          questions[`entry${i}`] = noul(
            `Did the answer draw on the log entry at \`entries[${i}]\`?`,
            {
              true: "The answer states, counts, summarises or refers to something that is in this entry. It is one of the entries a reader would want to see to check the answer.",
              false:
                "The answer does not rest on this entry. Sharing a topic or a word with it is not enough — the answer has to actually use what is in it.",
            }
          );
        });

        const { answers } = await getClient().systemOne({
          state: { answer, entries: chunk.map((c) => ({ when: c.when, summary: c.summary })) },
          questions,
        });

        return chunk.filter((_, i) => (answers[`entry${i}`]?.noul ?? 0) > 0.5).map((c) => c.id);
      })
    );

    return results.flat();
  } catch (err) {
    console.error("Entry attribution unavailable; the answer stands on its own.", err);
    return [];
  }
}
