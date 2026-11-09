CREATE TABLE "student_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_subjects" ALTER COLUMN "practical_full" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "class_subjects" ALTER COLUMN "practical_pass" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "class_subjects" ALTER COLUMN "internal_full" SET DEFAULT 25;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD COLUMN "internal_pass" integer DEFAULT 9 NOT NULL;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD COLUMN "theory_credit_hours" numeric(4, 1) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "class_subjects" ADD COLUMN "internal_credit_hours" numeric(4, 1) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "optional_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "student_subject_uq" ON "student_subjects" USING btree ("student_id","subject_id");--> statement-breakpoint
CREATE INDEX "student_subjects_school_idx" ON "student_subjects" USING btree ("school_id");--> statement-breakpoint
-- Optional-subject counts: classes 9 & 10 → 2 choices, classes 11 & 12 → 3 choices.
UPDATE "classes" SET "optional_count" = 2
  WHERE "optional_count" = 0 AND trim("name") IN ('9','10','Nine','Ten','Grade 9','Grade 10','Class 9','Class 10','IX','X');--> statement-breakpoint
UPDATE "classes" SET "optional_count" = 3
  WHERE "optional_count" = 0 AND trim("name") IN ('11','12','Eleven','Twelve','Grade 11','Grade 12','Class 11','Class 12','XI','XII');--> statement-breakpoint
-- Shift the mark split from PRACTICAL → INTERNAL (totals stay identical: theory + internal = old theory + practical).
UPDATE "class_subjects"
   SET "internal_pass" = "practical_pass",
       "internal_full" = "internal_full" + "practical_full",
       "practical_full" = 0,
       "practical_pass" = 0
 WHERE "practical_full" > 0 OR "practical_pass" > 0;--> statement-breakpoint
-- Split credit hours: existing total becomes the theory credit (schools can edit the internal share).
UPDATE "class_subjects"
   SET "theory_credit_hours" = "credit_hours",
       "internal_credit_hours" = '0'
 WHERE "theory_credit_hours" = '0' AND "internal_credit_hours" = '0' AND "credit_hours" <> '0';