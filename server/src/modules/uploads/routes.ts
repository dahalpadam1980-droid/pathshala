import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { authenticate } from '../../middleware/auth.js';
import { config } from '../../config.js';

const router = Router();

const uploadDir = path.resolve(config.uploadDir);
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    cb(null, `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`);
  },
});

const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.csv', '.xlsx', '.xls', '.doc', '.docx', '.txt']);

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED.has(ext)) cb(null, true);
    else cb(new Error(`File type not allowed: ${ext}`));
  },
});

/** POST /uploads — multipart field "file"; returns { url, filename } */
router.post('/', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: 'No file provided' } });
    return;
  }
  res.json({
    ok: true,
    data: { url: `/uploads/${req.file.filename}`, filename: req.file.filename, originalName: req.file.originalname, size: req.file.size },
  });
});

export default router;
