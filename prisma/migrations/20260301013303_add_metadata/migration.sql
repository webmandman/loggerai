-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LogEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rawInput" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "actionItems" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "mood" TEXT,
    "inputMethod" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_LogEntry" ("actionItems", "category", "createdAt", "id", "inputMethod", "mood", "rawInput", "summary", "tags", "updatedAt") SELECT "actionItems", "category", "createdAt", "id", "inputMethod", "mood", "rawInput", "summary", "tags", "updatedAt" FROM "LogEntry";
DROP TABLE "LogEntry";
ALTER TABLE "new_LogEntry" RENAME TO "LogEntry";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
