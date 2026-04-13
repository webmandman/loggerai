-- CreateTable
CREATE TABLE "LogEntry" (
    "id" TEXT NOT NULL,
    "rawInput" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "actionItems" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "mood" TEXT,
    "inputMethod" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogEntry_pkey" PRIMARY KEY ("id")
);
