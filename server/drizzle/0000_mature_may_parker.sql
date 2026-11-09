CREATE TABLE "academic_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_bs" text NOT NULL,
	"end_bs" text NOT NULL,
	"start_ad" date NOT NULL,
	"end_ad" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"detail" jsonb,
	"ip" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ne" text,
	"type" text DEFAULT 'private' NOT NULL,
	"levels" jsonb DEFAULT '["ecd","basic","secondary"]'::jsonb,
	"logo_url" text,
	"stamp_url" text,
	"address" text,
	"municipality" text,
	"ward" integer,
	"district" text,
	"province" text,
	"registration_no" text,
	"emis_code" text,
	"phone" text,
	"alt_phone" text,
	"email" text,
	"website" text,
	"social" jsonb DEFAULT '{}'::jsonb,
	"principal_name" text,
	"principal_phone" text,
	"established_date" date,
	"motto_en" text,
	"motto_ne" text,
	"branding" jsonb DEFAULT '{}'::jsonb,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"plan" text DEFAULT 'standard' NOT NULL,
	"trial_ends_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "schools_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid,
	"filename" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"path" text NOT NULL,
	"owner_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"school_id" uuid,
	"success" boolean NOT NULL,
	"reason" text,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid,
	"role" text DEFAULT 'teacher' NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"phone" text,
	"password_hash" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ne" text,
	"photo_url" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "class_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"is_compulsory" boolean DEFAULT true NOT NULL,
	"theory_full" integer DEFAULT 75 NOT NULL,
	"theory_pass" integer DEFAULT 24 NOT NULL,
	"practical_full" integer DEFAULT 25 NOT NULL,
	"practical_pass" integer DEFAULT 9 NOT NULL,
	"internal_full" integer DEFAULT 0 NOT NULL,
	"credit_hours" numeric(4, 1) DEFAULT '0',
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_ne" text,
	"level" text DEFAULT 'basic' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"period_no" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"type" text DEFAULT 'class' NOT NULL,
	"subject_id" uuid,
	"employee_id" uuid,
	"room" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"title_en" text NOT NULL,
	"title_ne" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"type" text DEFAULT 'event' NOT NULL,
	"description" text,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"name" text NOT NULL,
	"class_teacher_id" uuid,
	"room" text,
	"capacity" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subject_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"class_subject_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"code" text,
	"name_en" text NOT NULL,
	"name_ne" text,
	"type" text DEFAULT 'compulsory' NOT NULL,
	"credit_hours" numeric(4, 1) DEFAULT '0',
	"has_practical" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admission_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name_en" text NOT NULL,
	"name_ne" text,
	"class_applied" text NOT NULL,
	"dob_ad" date,
	"dob_bs" text,
	"gender" text,
	"father_name" text,
	"mother_name" text,
	"guardian_phone" text,
	"address" text,
	"prev_school" text,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"student_id" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"section_id" uuid,
	"roll_no" integer,
	"status" text DEFAULT 'studying' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"from_class_id" uuid NOT NULL,
	"to_class_id" uuid NOT NULL,
	"student_ids" jsonb NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"file_url" text NOT NULL,
	"issued_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"admission_no" text NOT NULL,
	"student_code" text,
	"name_en" text NOT NULL,
	"name_ne" text,
	"dob_bs" text,
	"dob_ad" date,
	"gender" text DEFAULT 'other',
	"blood_group" text,
	"phone" text,
	"email" text,
	"address" text,
	"municipality" text,
	"ward" integer,
	"district" text,
	"province" text,
	"father_name" text,
	"father_phone" text,
	"father_occupation" text,
	"mother_name" text,
	"mother_phone" text,
	"mother_occupation" text,
	"guardian_name" text,
	"guardian_relation" text,
	"guardian_phone" text,
	"prev_school" text,
	"admission_date" date,
	"academic_year_id" uuid,
	"class_id" uuid,
	"section_id" uuid,
	"roll_no" integer,
	"house" text,
	"photo_url" text,
	"medical" jsonb DEFAULT '{}'::jsonb,
	"transport" jsonb DEFAULT '{}'::jsonb,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"user_id" uuid,
	"enrolled_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"emp_code" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ne" text,
	"photo_url" text,
	"gender" text DEFAULT 'other',
	"dob" date,
	"phone" text,
	"email" text,
	"address" text,
	"municipality" text,
	"ward" integer,
	"district" text,
	"province" text,
	"appointment_date" date,
	"appointment_type" text DEFAULT 'permanent' NOT NULL,
	"designation" text,
	"level" text,
	"subject_specialization" text,
	"qualification" jsonb DEFAULT '[]'::jsonb,
	"teaching_license" text,
	"is_teacher" boolean DEFAULT true NOT NULL,
	"salary_scale" jsonb DEFAULT '{}'::jsonb,
	"bank_name" text,
	"bank_account" text,
	"pan_no" text,
	"leave_balance" jsonb DEFAULT '{}'::jsonb,
	"user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"end_date" date,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type" text DEFAULT 'casual' NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"days" integer DEFAULT 1 NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp,
	"remarks" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"record_date" date NOT NULL,
	"type" text NOT NULL,
	"details" text,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trainings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"title" text NOT NULL,
	"provider" text,
	"from_date" date,
	"to_date" date,
	"hours" integer,
	"certificate_no" text,
	"remarks" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"date" date NOT NULL,
	"check_in" text,
	"check_out" text,
	"status" text DEFAULT 'present' NOT NULL,
	"method" text DEFAULT 'manual' NOT NULL,
	"remarks" text,
	"marked_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"section_id" uuid,
	"subject_id" uuid,
	"student_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" text DEFAULT 'present' NOT NULL,
	"remarks" text,
	"marked_by" uuid,
	"corrected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_routine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"class_id" uuid,
	"date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"subject_id" uuid,
	"room" text,
	"invigilator_ids" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"theory_full" integer DEFAULT 75 NOT NULL,
	"theory_pass" integer DEFAULT 24 NOT NULL,
	"practical_full" integer DEFAULT 25 NOT NULL,
	"practical_pass" integer DEFAULT 9 NOT NULL,
	"internal_full" integer DEFAULT 0 NOT NULL,
	"internal_pass" integer DEFAULT 0 NOT NULL,
	"credit_hours" numeric(4, 1) DEFAULT '0',
	"exam_date" date,
	"start_time" text,
	"room" text,
	"invigilator_id" uuid
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_ne" text,
	"type" text DEFAULT 'terminal' NOT NULL,
	"class_id" uuid,
	"start_date" date,
	"end_date" date,
	"grading_scale_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"routine_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"published_by" uuid,
	"locked_at" timestamp,
	"remarks" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grade_bands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scale_id" uuid NOT NULL,
	"min_percent" numeric(6, 2) NOT NULL,
	"max_percent" numeric(6, 2) NOT NULL,
	"letter" text NOT NULL,
	"grade_point" numeric(4, 2) NOT NULL,
	"remark" text,
	"is_ng" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grading_scales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"class_id" uuid,
	"exam_type" text,
	"gpa_formula" text DEFAULT 'weighted',
	"ng_threshold_percent" numeric(5, 2) DEFAULT '0',
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"exam_subject_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"theory_obtained" numeric(6, 2),
	"practical_obtained" numeric(6, 2),
	"internal_obtained" numeric(6, 2),
	"total" numeric(6, 2) DEFAULT '0',
	"max_total" numeric(6, 2) DEFAULT '0',
	"percent" numeric(6, 2) DEFAULT '0',
	"is_absent" boolean DEFAULT false NOT NULL,
	"is_passed" boolean DEFAULT false NOT NULL,
	"grade_letter" text,
	"grade_point" numeric(4, 2),
	"remark" text,
	"entered_by" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_heads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"code" text,
	"name_en" text NOT NULL,
	"name_ne" text,
	"type" text NOT NULL,
	"group" text DEFAULT 'other_income' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_heads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"code" text,
	"name_en" text NOT NULL,
	"name_ne" text,
	"frequency" text DEFAULT 'monthly' NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_structure_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"structure_id" uuid NOT NULL,
	"fee_head_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_structures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"student_fee_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"receipt_no" text NOT NULL,
	"student_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"reference" text,
	"paid_at" timestamp DEFAULT now() NOT NULL,
	"received_by" uuid,
	"remarks" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scholarships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"type" text DEFAULT 'discount' NOT NULL,
	"name" text,
	"percent" numeric(6, 2) DEFAULT '0',
	"amount" numeric(12, 2) DEFAULT '0',
	"reason" text,
	"start_date" date,
	"end_date" date,
	"active" boolean DEFAULT true NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_fees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"fee_head_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"label" text NOT NULL,
	"period" text,
	"due_date" date,
	"amount" numeric(12, 2) NOT NULL,
	"discount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"fine" numeric(12, 2) DEFAULT '0' NOT NULL,
	"paid_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'unpaid' NOT NULL,
	"waived_reason" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"txn_date" date NOT NULL,
	"head_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"mode" text DEFAULT 'cash' NOT NULL,
	"category" text,
	"description" text,
	"reference" text,
	"student_id" uuid,
	"payment_id" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"basic" numeric(12, 2) DEFAULT '0' NOT NULL,
	"allowances" jsonb DEFAULT '[]'::jsonb,
	"deductions" jsonb DEFAULT '[]'::jsonb,
	"gross" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_deductions" numeric(12, 2) DEFAULT '0' NOT NULL,
	"net" numeric(12, 2) DEFAULT '0' NOT NULL,
	"payable_days" integer DEFAULT 30,
	"absent_days" integer DEFAULT 0,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"label" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_gross" numeric(14, 2) DEFAULT '0',
	"total_deductions" numeric(14, 2) DEFAULT '0',
	"total_net" numeric(14, 2) DEFAULT '0',
	"created_by" uuid,
	"finalized_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_structures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"grade" text,
	"level" text,
	"basic" numeric(12, 2) DEFAULT '0' NOT NULL,
	"allowances" jsonb DEFAULT '[]'::jsonb,
	"deductions" jsonb DEFAULT '[]'::jsonb,
	"effective_from" date,
	"effective_to" date,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"issued_to_type" text DEFAULT 'student' NOT NULL,
	"issued_to_id" uuid NOT NULL,
	"issued_by" uuid,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"due_date" date NOT NULL,
	"returned_at" timestamp,
	"fine" numeric(8, 2) DEFAULT '0',
	"fine_paid" boolean DEFAULT false NOT NULL,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"accession_no" text NOT NULL,
	"isbn" text,
	"title" text NOT NULL,
	"title_ne" text,
	"author" text,
	"publisher" text,
	"category" text,
	"edition" text,
	"language" text DEFAULT 'en',
	"price" numeric(10, 2) DEFAULT '0',
	"quantity" integer DEFAULT 1 NOT NULL,
	"available" integer DEFAULT 1 NOT NULL,
	"shelf" text,
	"description" text,
	"status" text DEFAULT 'available' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"party" text,
	"cost" numeric(12, 2) DEFAULT '0',
	"remarks" text,
	"performed_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'furniture' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit" text DEFAULT 'pcs',
	"purchase_date" date,
	"purchase_cost" numeric(14, 2) DEFAULT '0',
	"supplier" text,
	"warranty_until" date,
	"condition" text DEFAULT 'good' NOT NULL,
	"location" text,
	"assigned_to" text,
	"depreciation_rate" numeric(5, 2) DEFAULT '0',
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"subject" text,
	"type" text DEFAULT 'direct' NOT NULL,
	"participant_ids" jsonb DEFAULT '[]'::jsonb,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"read_by" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"title_en" text NOT NULL,
	"title_ne" text,
	"body_en" text NOT NULL,
	"body_ne" text,
	"audience" jsonb DEFAULT '{"all":false,"roles":[],"classIds":[]}'::jsonb,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"priority" text DEFAULT 'normal' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"published_at" timestamp,
	"author_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"user_id" uuid,
	"channel" text DEFAULT 'inapp' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"sent_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"section_id" uuid,
	"subject_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"due_date" date,
	"total_marks" integer DEFAULT 100,
	"attachment_url" text,
	"teacher_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"class_id" uuid,
	"section_id" uuid,
	"subject_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'pdf' NOT NULL,
	"url" text NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"teacher_id" uuid,
	"downloads" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"submitted_at" timestamp,
	"answers" jsonb DEFAULT '{}'::jsonb,
	"score" integer DEFAULT 0,
	"max_score" integer DEFAULT 0,
	"auto_evaluated" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"type" text DEFAULT 'mcq' NOT NULL,
	"question" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb,
	"correct_index" integer,
	"correct_answer" text,
	"marks" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"section_id" uuid,
	"subject_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"time_limit_minutes" integer DEFAULT 30,
	"total_marks" integer DEFAULT 0,
	"opens_at" timestamp,
	"closes_at" timestamp,
	"teacher_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"file_url" text,
	"note" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"marks_obtained" integer,
	"feedback" text,
	"graded_at" timestamp,
	"graded_by" uuid
);
--> statement-breakpoint
CREATE TABLE "certificate_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"body_html" text NOT NULL,
	"signature_fields" jsonb DEFAULT '[{"label":"Principal / Headteacher","role":"principal"}]'::jsonb,
	"use_school_logo" boolean DEFAULT true NOT NULL,
	"use_school_stamp" boolean DEFAULT true NOT NULL,
	"page_size" text DEFAULT 'a4',
	"is_default" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issued_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"type" text NOT NULL,
	"template_id" uuid,
	"student_id" uuid,
	"employee_id" uuid,
	"serial_no" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"issued_by" uuid,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "committee_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"committee_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_ne" text,
	"role" text DEFAULT 'member' NOT NULL,
	"phone" text,
	"email" text,
	"address" text,
	"occupation" text,
	"appointed_on" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "committees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'smc' NOT NULL,
	"formed_on" date,
	"term_ends_on" date,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_attendances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"present" boolean DEFAULT false NOT NULL,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"committee_id" uuid,
	"title" text NOT NULL,
	"meeting_date" date NOT NULL,
	"start_time" text,
	"venue" text,
	"agenda" jsonb DEFAULT '[]'::jsonb,
	"minutes" text,
	"decisions" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"stop_name" text,
	"monthly_fare" numeric(10, 2) DEFAULT '0',
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"vehicle_id" uuid,
	"stops" jsonb DEFAULT '[]'::jsonb,
	"monthly_fare" numeric(10, 2) DEFAULT '0',
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"date" date NOT NULL,
	"type" text DEFAULT 'fuel' NOT NULL,
	"description" text,
	"liters" numeric(8, 2),
	"odometer" integer,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"vendor" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"plate_no" text NOT NULL,
	"type" text DEFAULT 'bus',
	"model" text,
	"capacity" integer,
	"insurance_expiry" date,
	"fitness_expiry" date,
	"status" text DEFAULT 'active' NOT NULL,
	"driver_name" text,
	"driver_phone" text,
	"helper_name" text,
	"helper_phone" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hostel_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"bed_no" text,
	"from_date" date,
	"to_date" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hostel_complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid,
	"body" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hostel_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hostel_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"room_no" text NOT NULL,
	"capacity" integer DEFAULT 4 NOT NULL,
	"occupied" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'available' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hostels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"warden" text,
	"capacity" integer DEFAULT 0,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gallery_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"title" text,
	"url" text NOT NULL,
	"type" text DEFAULT 'image' NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"template" text DEFAULT 'custom',
	"title_en" text NOT NULL,
	"title_ne" text,
	"body_en" text,
	"body_ne" text,
	"hero_image_url" text,
	"published" boolean DEFAULT true NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"seo_description" text,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "academic_years_school_idx" ON "academic_years" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "audit_school_idx" ON "audit_logs" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "school_settings_key_uq" ON "school_settings" USING btree ("school_id","key");--> statement-breakpoint
CREATE INDEX "schools_status_idx" ON "schools" USING btree ("status");--> statement-breakpoint
CREATE INDEX "uploads_school_idx" ON "uploads" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "login_user_idx" ON "login_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_school_idx" ON "users" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "class_subject_uq" ON "class_subjects" USING btree ("class_id","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "classes_school_name_uq" ON "classes" USING btree ("school_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "routine_slot_uq" ON "routines" USING btree ("section_id","day","period_no");--> statement-breakpoint
CREATE INDEX "events_school_idx" ON "school_events" USING btree ("school_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sections_class_name_uq" ON "sections" USING btree ("class_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "subject_assign_uq" ON "subject_assignments" USING btree ("section_id","class_subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_school_code_uq" ON "subjects" USING btree ("school_id","code");--> statement-breakpoint
CREATE INDEX "applications_school_idx" ON "admission_applications" USING btree ("school_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "enroll_uq" ON "enrollments" USING btree ("student_id","academic_year_id");--> statement-breakpoint
CREATE INDEX "promotions_school_idx" ON "promotions" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "student_docs_idx" ON "student_documents" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_school_admission_uq" ON "students" USING btree ("school_id","admission_no");--> statement-breakpoint
CREATE INDEX "students_class_idx" ON "students" USING btree ("school_id","class_id","section_id");--> statement-breakpoint
CREATE INDEX "students_name_idx" ON "students" USING btree ("name_en");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_school_code_uq" ON "employees" USING btree ("school_id","emp_code");--> statement-breakpoint
CREATE INDEX "employees_name_idx" ON "employees" USING btree ("name_en");--> statement-breakpoint
CREATE INDEX "leaves_school_idx" ON "leaves" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX "service_emp_idx" ON "service_records" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "trainings_emp_idx" ON "trainings" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_attendance_uq" ON "employee_attendance" USING btree ("date","employee_id");--> statement-breakpoint
CREATE INDEX "employee_attendance_school_idx" ON "employee_attendance" USING btree ("school_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "student_attendance_uq" ON "student_attendance" USING btree ("date","student_id",coalesce("subject_id", '00000000-0000-0000-0000-000000000000'));--> statement-breakpoint
CREATE INDEX "student_attendance_section_idx" ON "student_attendance" USING btree ("school_id","date","section_id");--> statement-breakpoint
CREATE INDEX "exam_routine_idx" ON "exam_routine" USING btree ("exam_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_subject_uq" ON "exam_subjects" USING btree ("exam_id","class_id","subject_id");--> statement-breakpoint
CREATE INDEX "exams_school_idx" ON "exams" USING btree ("school_id","academic_year_id");--> statement-breakpoint
CREATE INDEX "grade_bands_scale_idx" ON "grade_bands" USING btree ("scale_id");--> statement-breakpoint
CREATE INDEX "grading_scales_school_idx" ON "grading_scales" USING btree ("school_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marks_uq" ON "marks" USING btree ("exam_subject_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_heads_uq" ON "account_heads" USING btree ("school_id","name_en");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_heads_school_uq" ON "fee_heads" USING btree ("school_id","name_en");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_structure_item_uq" ON "fee_structure_items" USING btree ("structure_id","fee_head_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_structure_uq" ON "fee_structures" USING btree ("school_id","academic_year_id","class_id");--> statement-breakpoint
CREATE INDEX "payment_items_fee_idx" ON "payment_items" USING btree ("student_fee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_receipt_uq" ON "payments" USING btree ("school_id","receipt_no");--> statement-breakpoint
CREATE INDEX "payments_student_idx" ON "payments" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "scholarships_student_idx" ON "scholarships" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "student_fees_idx" ON "student_fees" USING btree ("school_id","student_id","status");--> statement-breakpoint
CREATE INDEX "transactions_school_date_idx" ON "transactions" USING btree ("school_id","txn_date");--> statement-breakpoint
CREATE INDEX "transactions_head_idx" ON "transactions" USING btree ("head_id");--> statement-breakpoint
CREATE INDEX "payroll_items_run_idx" ON "payroll_items" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_item_uq" ON "payroll_items" USING btree ("run_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_run_uq" ON "payroll_runs" USING btree ("school_id","month","year");--> statement-breakpoint
CREATE INDEX "salary_struct_emp_idx" ON "salary_structures" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "book_issues_idx" ON "book_issues" USING btree ("school_id","book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "books_accession_uq" ON "books" USING btree ("school_id","accession_no");--> statement-breakpoint
CREATE INDEX "books_title_idx" ON "books" USING btree ("title");--> statement-breakpoint
CREATE INDEX "asset_movements_idx" ON "asset_movements" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_code_uq" ON "assets" USING btree ("school_id","code");--> statement-breakpoint
CREATE INDEX "assets_category_idx" ON "assets" USING btree ("school_id","category");--> statement-breakpoint
CREATE INDEX "conversations_school_idx" ON "conversations" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "messages_conv_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "notices_school_idx" ON "notices" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX "notifications_school_idx" ON "notifications" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX "assignments_school_idx" ON "assignments" USING btree ("school_id","class_id");--> statement-breakpoint
CREATE INDEX "materials_school_idx" ON "materials" USING btree ("school_id","class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_attempt_uq" ON "quiz_attempts" USING btree ("quiz_id","student_id");--> statement-breakpoint
CREATE INDEX "quiz_questions_idx" ON "quiz_questions" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "quizzes_school_idx" ON "quizzes" USING btree ("school_id","class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_uq" ON "submissions" USING btree ("assignment_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cert_template_uq" ON "certificate_templates" USING btree ("school_id","type","name");--> statement-breakpoint
CREATE UNIQUE INDEX "cert_serial_uq" ON "issued_certificates" USING btree ("school_id","serial_no");--> statement-breakpoint
CREATE INDEX "cert_student_idx" ON "issued_certificates" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "committee_members_idx" ON "committee_members" USING btree ("committee_id");--> statement-breakpoint
CREATE INDEX "committees_school_idx" ON "committees" USING btree ("school_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_attendance_uq" ON "meeting_attendances" USING btree ("meeting_id","member_id");--> statement-breakpoint
CREATE INDEX "meetings_school_idx" ON "meetings" USING btree ("school_id","meeting_date");--> statement-breakpoint
CREATE UNIQUE INDEX "transport_alloc_uq" ON "transport_allocations" USING btree ("route_id","student_id");--> statement-breakpoint
CREATE INDEX "transport_routes_idx" ON "transport_routes" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "vehicle_expenses_idx" ON "vehicle_expenses" USING btree ("vehicle_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_plate_uq" ON "vehicles" USING btree ("school_id","plate_no");--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_alloc_uq" ON "hostel_allocations" USING btree ("room_id","student_id");--> statement-breakpoint
CREATE INDEX "hostel_complaints_idx" ON "hostel_complaints" USING btree ("school_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_room_uq" ON "hostel_rooms" USING btree ("hostel_id","room_no");--> statement-breakpoint
CREATE INDEX "hostels_school_idx" ON "hostels" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "gallery_school_idx" ON "gallery_items" USING btree ("school_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_pages_uq" ON "site_pages" USING btree ("school_id","slug");