const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const menuController = require('../controllers/menu.controller');

const router = express.Router();

// Use a temporary directory for uploads within the project that is gitignored
const uploadDir = path.resolve(__dirname, '../../../../ecKasseIn/temp_uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024, files: 5 }, // 100MB limit per file
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and PDFs are allowed.'), false);
    }
  }
});

router.post('/upload-and-import', upload.array('menuFiles', 5), menuController.uploadAndImportMenu);

module.exports = router;