require('dotenv').config();
'use strict';

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { put } = require('@vercel/blob');
const path = require('path');

const app = express();

// ============ المتغيرات ============
const PORT = Number(process.env.PORT || 5000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://admin:password@cluster.mongodb.net/okasha?retryWrites=true&w=majority';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5000';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123456';

// ============ الأمان ============
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const allowedOrigins = FRONTEND_URL.split(',').map(url => url.trim()).filter(Boolean);
const corsOptions = {
  origin(origin, callback) {
    if (!origin || NODE_ENV !== 'production' || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS: Origin غير مسموح به'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' }));

// ============ تقديم الملفات الثابتة ============
app.use(express.static(path.join(__dirname), {
  maxAge: '1h',
  etag: false
}));

// ============ Rate Limiting ============
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use('/api', apiLimiter);
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

// ============ قاعدة البيانات ============
let cached = global.__okashaMongo || { conn: null, promise: null };
if (!global.__okashaMongo) global.__okashaMongo = cached;

async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 })
      .then(m => { console.log('✅ MongoDB متصل'); return m; })
      .catch(e => { cached.promise = null; throw e; });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

// ============ الـ Schemas ============
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true },
  parentPhone: { type: String },
  stage: { type: String },
  grade: { type: String },
  username: { type: String, required: true, unique: true, trim: true, lowercase: true, minlength: 3 },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'student'], default: 'student' },
  status: { type: String, enum: ['pending', 'approved'], default: 'pending' }
}, { timestamps: true });

const lessonSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  stage: { type: String },
  grade: { type: String },
  content: { type: String },
  videoUrl: { type: String },
  pdfUrl: { type: String },
  driveUrl: { type: String },
  views: { type: Number, default: 0 }
}, { timestamps: true });

const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  options: { type: [String], required: true, validate: { validator: (arr) => arr.length === 4 } },
  correctAnswerIndex: { type: Number, required: true, min: 0, max: 3 },
  explanation: { type: String }
});

const examSchema = new mongoose.Schema({
  title: { type: String, required: true },
  stage: { type: String },
  grade: { type: String },
  questions: { type: [questionSchema], required: true, validate: { validator: (arr) => arr.length >= 1 } },
  duration: { type: Number, default: 60 },
  passingScore: { type: Number, default: 60 }
}, { timestamps: true });

const resultSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  studentName: { type: String, required: true },
  exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  examTitle: { type: String, required: true },
  score: { type: Number, required: true },
  total: { type: Number, required: true },
  percentage: { type: Number, required: true },
  isPassed: { type: Boolean }
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Lesson = mongoose.models.Lesson || mongoose.model('Lesson', lessonSchema);
const Exam = mongoose.models.Exam || mongoose.model('Exam', examSchema);
const Result = mongoose.models.Result || mongoose.model('Result', resultSchema);

// ============ Middleware ============
const storage = multer.memoryStorage();
const upload = multer({ 
  storage, 
  fileFilter: (req, file, cb) => file.mimetype === 'application/pdf' ? cb(null, true) : cb(new Error('PDF only')),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'Token مفقود' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    res.status(401).json({ message: 'Token غير صحيح' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'المسؤول فقط' });
  next();
};

const cleanString = (value, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const validObjectId = (id) => mongoose.isValidObjectId(id);
const publicUser = (user) => ({ _id: user._id, name: user.name, phone: user.phone, stage: user.stage, grade: user.grade, username: user.username, role: user.role, status: user.status });

// ============ Routes - تقديم index.html ============

// المسار الجذري - تقديم الواجهة الأمامية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// الصحة
app.get('/api/health', async (req, res) => {
  try {
    await connectDB();
    res.json({ ok: true, message: 'الخادم يعمل' });
  } catch {
    res.status(500).json({ ok: false });
  }
});

// التسجيل
app.post('/api/register', async (req, res) => {
  try {
    await connectDB();
    const { name, phone, parentPhone, stage, grade, username, password } = req.body;
    const cleanUsername = cleanString(username, 40).toLowerCase();

    if (!name || !phone || !stage || !grade || !cleanUsername || !password) {
      return res.status(400).json({ message: 'البيانات غير مكتملة' });
    }
    if (password.length < 8) return res.status(400).json({ message: 'كلمة مرور قصيرة' });

    const existing = await User.findOne({ username: cleanUsername });
    if (existing) return res.status(409).json({ message: 'اسم المستخدم موجود' });

    const hashedPassword = await bcrypt.hash(password, 12);
    await User.create({
      name: cleanString(name, 100),
      phone,
      parentPhone: cleanString(parentPhone),
      stage,
      grade,
      username: cleanUsername,
      password: hashedPassword,
      role: 'student',
      status: 'pending'
    });

    res.status(201).json({ message: 'تم الطلب، بانتظار الموافقة' });
  } catch (error) {
    console.error('Register:', error);
    res.status(500).json({ message: 'خطأ التسجيل' });
  }
});

// الدخول
app.post('/api/login', async (req, res) => {
  try {
    await connectDB();
    const username = cleanString(req.body.username, 40).toLowerCase();
    const password = req.body.password;

    const user = await User.findOne({ username }).select('+password');
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'بيانات خاطئة' });
    }
    if (user.role === 'student' && user.status !== 'approved') {
      return res.status(403).json({ message: 'حسابك قيد الانتظار' });
    }

    const token = jwt.sign(
      { id: String(user._id), role: user.role, name: user.name, grade: user.grade },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: publicUser(user) });
  } catch (error) {
    console.error('Login:', error);
    res.status(500).json({ message: 'خطأ الدخول' });
  }
});

// بيانات الطالب
app.get('/api/me', auth, async (req, res) => {
  try {
    await connectDB();
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'غير موجود' });
    res.json({ user: publicUser(user) });
  } catch {
    res.status(500).json({ message: 'خطأ' });
  }
});

// ============ الدروس ============

app.get('/api/lessons', auth, async (req, res) => {
  try {
    await connectDB();
    const filter = req.user.role === 'student' ? { grade: req.user.grade } : {};
    const lessons = await Lesson.find(filter).sort({ createdAt: -1 }).lean();
    res.json(lessons);
  } catch {
    res.status(500).json({ message: 'خطأ الدروس' });
  }
});

app.post('/api/admin/lessons', auth, adminOnly, upload.single('pdfFile'), async (req, res) => {
  try {
    await connectDB();
    const { title, stage, grade, content, videoUrl, driveUrl } = req.body;

    if (!title) return res.status(400).json({ message: 'العنوان مطلوب' });

    const lesson = await Lesson.create({
      title,
      stage,
      grade,
      content,
      videoUrl,
      driveUrl,
      pdfUrl: req.file ? await uploadPdf(req.file) : ''
    });

    res.status(201).json({ message: 'تم النشر', data: lesson });
  } catch (error) {
    console.error('Lesson:', error);
    res.status(500).json({ message: 'خطأ النشر' });
  }
});

app.delete('/api/admin/lessons/:id', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    if (!validObjectId(req.params.id)) return res.status(400).json({ message: 'معرف خاطئ' });
    await Lesson.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم الحذف' });
  } catch {
    res.status(500).json({ message: 'خطأ' });
  }
});

// ============ الامتحانات ============

app.get('/api/exams', auth, async (req, res) => {
  try {
    await connectDB();
    const filter = req.user.role === 'student' ? { grade: req.user.grade } : {};
    const exams = await Exam.find(filter).sort({ createdAt: -1 }).select('-questions.correctAnswerIndex').lean();
    res.json(exams);
  } catch {
    res.status(500).json({ message: 'خطأ الامتحانات' });
  }
});

app.get('/api/exams/:id', auth, async (req, res) => {
  try {
    await connectDB();
    if (!validObjectId(req.params.id)) return res.status(400).json({ message: 'معرف خاطئ' });
    const exam = await Exam.findById(req.params.id).select('-questions.correctAnswerIndex').lean();
    if (!exam) return res.status(404).json({ message: 'غير موجود' });
    res.json(exam);
  } catch {
    res.status(500).json({ message: 'خطأ' });
  }
});

app.post('/api/exams/:id/submit', auth, async (req, res) => {
  try {
    await connectDB();
    if (!validObjectId(req.params.id)) return res.status(400).json({ message: 'معرف خاطئ' });

    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'غير موجود' });

    let score = 0;
    const answers = req.body.answers || [];
    exam.questions.forEach((q, i) => {
      if (answers[i] === q.correctAnswerIndex) score++;
    });

    const percentage = Math.round((score / exam.questions.length) * 100);
    const isPassed = percentage >= exam.passingScore;

    await Result.create({
      student: req.user.id,
      studentName: req.user.name,
      exam: exam._id,
      examTitle: exam.title,
      score,
      total: exam.questions.length,
      percentage,
      isPassed
    });

    res.status(201).json({ score, totalScore: exam.questions.length, percentage, isPassed, message: isPassed ? 'مبروك!' : 'حاول مجدداً' });
  } catch (error) {
    console.error('Submit:', error);
    res.status(500).json({ message: 'خطأ التسليم' });
  }
});

app.post('/api/admin/exams', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    const { title, stage, grade, questions } = req.body;

    if (!title || !questions?.length) return res.status(400).json({ message: 'بيانات ناقصة' });

    await Exam.create({ title, stage, grade, questions });
    res.status(201).json({ message: 'تم الإنشاء' });
  } catch {
    res.status(400).json({ message: 'خطأ في البيانات' });
  }
});

app.delete('/api/admin/exams/:id', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    if (!validObjectId(req.params.id)) return res.status(400).json({ message: 'معرف خاطئ' });
    await Exam.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم الحذف' });
  } catch {
    res.status(500).json({ message: 'خطأ' });
  }
});

// ============ إدارة الطلاب ============

app.get('/api/admin/pending-students', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    const students = await User.find({ status: 'pending', role: 'student' }).select('-password').sort({ createdAt: -1 });
    res.json(students.map(publicUser));
  } catch {
    res.status(500).json({ message: 'خطأ' });
  }
});

app.get('/api/admin/approved-students', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    const students = await User.find({ status: 'approved', role: 'student' }).select('-password').sort({ createdAt: -1 });
    res.json(students.map(publicUser));
  } catch {
    res.status(500).json({ message: 'خطأ' });
  }
});

app.post('/api/admin/approve-student/:id', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    if (!validObjectId(req.params.id)) return res.status(400).json({ message: 'معرف خاطئ' });
    await User.findByIdAndUpdate(req.params.id, { status: 'approved' });
    res.json({ message: 'تم القبول' });
  } catch {
    res.status(500).json({ message: 'خطأ' });
  }
});

app.delete('/api/admin/students/:id', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    if (!validObjectId(req.params.id)) return res.status(400).json({ message: 'معرف خاطئ' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم الحذف' });
  } catch {
    res.status(500).json({ message: 'خطأ' });
  }
});

// ============ النتائج والإحصائيات ============

app.get('/api/admin/results', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    const results = await Result.find().sort({ createdAt: -1 }).limit(500);
    res.json(results);
  } catch {
    res.status(500).json({ message: 'خطأ' });
  }
});

app.get('/api/student/results', auth, async (req, res) => {
  try {
    await connectDB();
    const results = await Result.find({ student: req.user.id }).sort({ createdAt: -1 });
    res.json(results);
  } catch {
    res.status(500).json({ message: 'خطأ' });
  }
});

app.get('/api/admin/stats', auth, adminOnly, async (req, res) => {
  try {
    await connectDB();
    const [approvedStudentsCount, pendingStudentsCount, lessonsCount, examsCount] = await Promise.all([
      User.countDocuments({ status: 'approved', role: 'student' }),
      User.countDocuments({ status: 'pending', role: 'student' }),
      Lesson.countDocuments(),
      Exam.countDocuments()
    ]);
    res.json({ approvedStudentsCount, pendingStudentsCount, lessonsCount, examsCount });
  } catch {
    res.status(500).json({ message: 'خطأ' });
  }
});

// ============ مساعدات ============

async function uploadPdf(file) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return '';
  try {
    const name = `lessons/${Date.now()}-${crypto.randomUUID()}.pdf`;
    const blob = await put(name, file.buffer, { access: 'public', contentType: 'application/pdf' });
    return blob.url;
  } catch {
    return '';
  }
}

// ============ معالج 404 للـ SPA ============
// أي مسار لا يبدأ بـ /api يُرجع index.html
app.use((req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'index.html'));
  } else {
    res.status(404).json({ message: 'Not found' });
  }
});

// ============ التشغيل ============

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`🚀 متاح على http://localhost:${PORT}`));
}

module.exports = app;
