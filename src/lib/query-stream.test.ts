// Run: npm run test:query-stream  (node --test, Node 24 strips the types natively)
// Relative import on purpose — the "@/" alias does not resolve under bare node.
//
// The bug this file exists for was a chunk-boundary bug, so the tests feed the
// text in deliberately awful splits: one character at a time, and straight
// through the middle of the marker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ID_MARKER, parseEntryIds, splitStream } from "./query-stream.ts";

/**
 * Drive the splitter the way the stream handler does, and report what a
 * reader would have seen plus what was left for the parser.
 */
function feed(chunks: string[]): { seen: string; tail: string | null } {
  let held = "";
  let seen = "";
  let tail: string | null = null;

  for (const chunk of chunks) {
    if (tail !== null) {
      tail += chunk;
      continue;
    }
    const split = splitStream(held + chunk);
    held = split.hold;
    tail = split.tail;
    seen += split.emit;
  }

  if (tail === null && held) seen += splitStream(held, true).emit;
  return { seen, tail };
}

const ANSWER = "You ran three times in September.";
const IDS = '\n["a1","b2"]';

test("plain text with no marker arrives whole", () => {
  const { seen, tail } = feed([ANSWER]);

  assert.equal(seen, ANSWER);
  assert.equal(tail, null);
});

test("the marker never reaches the reader, however the chunks fall", () => {
  const full = `${ANSWER}\n${ID_MARKER}${IDS}`;

  // One character at a time is the worst case and splits the marker 14 ways.
  const single = feed([...full]);
  assert.equal(single.seen, `${ANSWER}\n`);
  assert.equal(single.tail, IDS);

  // The specific break that used to leak: mid-marker.
  const at = full.indexOf(ID_MARKER);
  const mid = feed([full.slice(0, at + 6), full.slice(at + 6)]);
  assert.equal(mid.seen, `${ANSWER}\n`);
  assert.equal(mid.tail, IDS);
});

test("text sharing a chunk with the marker is not dropped with it", () => {
  // The old code binned the whole chunk once it saw the marker, taking the
  // last words of the answer with it.
  const { seen, tail } = feed(["You ran three times ", `in September.\n${ID_MARKER}${IDS}`]);

  assert.equal(seen, `${ANSWER}\n`);
  assert.equal(tail, IDS);
});

test("a dangling prefix of the marker is released at the end, not swallowed", () => {
  // An answer that really does end in dashes is text, once nothing more is
  // coming. Holding it back forever would silently truncate the answer.
  const { seen, tail } = feed(["and that was that ---"]);

  assert.equal(seen, "and that was that ---");
  assert.equal(tail, null);
});

test("only what could still become the marker is held back", () => {
  // Holding more than that would make the answer visibly stutter.
  const split = splitStream(`${ANSWER}\n---EN`);

  assert.equal(split.emit, `${ANSWER}\n`);
  assert.equal(split.hold, "---EN");
});

// --- reading the tail ----------------------------------------------------

const CANDIDATES = ["a1", "b2", "c3"];

test("the ids come back in order, deduped", () => {
  assert.deepEqual(parseEntryIds('\n["a1","b2","a1"]', CANDIDATES), ["a1", "b2"]);
});

test("an empty array is an answer, not a failure", () => {
  // The model saying "none of these are relevant" must not trigger the
  // fallback pass, which would go and disagree with it.
  assert.deepEqual(parseEntryIds("\n[]", CANDIDATES), []);
});

test("no marker is a failure, and says so", () => {
  assert.equal(parseEntryIds(null, CANDIDATES), null);
});

test("a tail that will not parse is a failure, not an empty list", () => {
  assert.equal(parseEntryIds('\n["a1", "b2"', CANDIDATES), null); // cut off
  assert.equal(parseEntryIds("\nnone of them", CANDIDATES), null);
  assert.equal(parseEntryIds("\n", CANDIDATES), null);
  assert.equal(parseEntryIds('\n{"ids":["a1"]}', CANDIDATES), null); // not an array
});

test("a fenced array still reads, because models fence things", () => {
  assert.deepEqual(parseEntryIds('```json\n["a1"]\n```', CANDIDATES), ["a1"]);
});

test("an id that was never on offer is dropped", () => {
  // Sending a made-up id to the batch endpoint just returns nothing, so it
  // gets filtered here where the reason is visible.
  assert.deepEqual(parseEntryIds('\n["a1","made-up","c3"]', CANDIDATES), ["a1", "c3"]);
  assert.deepEqual(parseEntryIds('\n[1,2,3]', CANDIDATES), []);
});
