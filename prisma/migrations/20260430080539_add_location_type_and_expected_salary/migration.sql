/*
  Warnings:

  - The `location` column on the `Application` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('REMOTE', 'ONSITE', 'HYBRID');

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "expectedSalary" TEXT,
DROP COLUMN "location",
ADD COLUMN     "location" "LocationType" NOT NULL DEFAULT 'ONSITE';
