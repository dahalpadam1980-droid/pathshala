import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { getDb } from './db/client.js';
import { startRateLimitCleanup } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

import authRoutes from './modules/auth/routes.js';
import usersRoutes from './modules/users/routes.js';
import schoolsRoutes from './modules/schools/routes.js';
import academicsRoutes from './modules/academics/routes.js';
import studentsRoutes from './modules/students/routes.js';
import staffRoutes from './modules/staff/routes.js';
import attendanceRoutes from './modules/attendance/routes.js';
import examsRoutes from './modules/exams/routes.js';
import financeRoutes from './modules/finance/routes.js';
import payrollRoutes from './modules/payroll/routes.js';
import libraryRoutes from './modules/library/routes.js';
import inventoryRoutes from './modules/inventory/routes.js';
import communicationRoutes from './modules/communication/routes.js';
import lmsRoutes from './modules/lms/routes.js';
import certificatesRoutes from './modules/certificates/routes.js';
import governanceRoutes from './modules/governance/routes.js';
import transportRoutes from './modules/transport/routes.js';
import hostelRoutes from './modules/hostel/routes.js';
import websiteRoutes from './modules/website/routes.js';
import reportsRoutes from './modules/reports/routes.js';
import uploadsRoutes from './modules/uploads/routes.js';
import settingsRoutes from './modules/settings/routes.js';
import aiRoutes from './modules/ai/routes.js';

const app = express();
app.set('trust proxy', true);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static uploads (photos, documents, templates)
const uploadDir = path.resolve(config.uploadDir);
fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir, { maxAge: '7d', dotfiles: 'deny' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'pathshala-erp', time: new Date().toISOString() });
});

const api = express.Router();
api.use('/auth', authRoutes);
api.use('/users', usersRoutes);
api.use('/schools', schoolsRoutes);
api.use('/academics', academicsRoutes);
api.use('/students', studentsRoutes);
api.use('/staff', staffRoutes);
api.use('/attendance', attendanceRoutes);
api.use('/exams', examsRoutes);
api.use('/finance', financeRoutes);
api.use('/payroll', payrollRoutes);
api.use('/library', libraryRoutes);
api.use('/inventory', inventoryRoutes);
api.use('/communication', communicationRoutes);
api.use('/lms', lmsRoutes);
api.use('/certificates', certificatesRoutes);
api.use('/governance', governanceRoutes);
api.use('/transport', transportRoutes);
api.use('/hostel', hostelRoutes);
api.use('/website', websiteRoutes);
api.use('/reports', reportsRoutes);
api.use('/uploads', uploadsRoutes);
api.use('/settings', settingsRoutes);
api.use('/ai', aiRoutes);

app.use('/api/v1', api);
app.use(notFoundHandler);
app.use(errorHandler);

async function main() {
  await getDb(); // connects + runs migrations
  startRateLimitCleanup();
  app.listen(config.port, () => {
    console.log(`Pathshala ERP API listening on http://localhost:${config.port}`);
    console.log(`Database driver: ${config.dbDriver}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
