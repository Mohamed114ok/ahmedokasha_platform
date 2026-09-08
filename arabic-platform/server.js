require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'okasha_secret_key_2026';
const MONGO_URI = process.env.MONGO_URI;

// ===================== Middleware ======================
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Use /tmp for Vercel (read-only filesystem except /tmp)
const isVercel = process.env.VERCEL === '1';
const uploadsDir = isVercel ? '/tmp/uploads' : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('يجب رفع ملف PDF فقط'), false);
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ===================== Schemas ======================
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 3 },
  phone: { type: String, required: true },
  parentPhone: String,
  stage: { type: String, enum: ['المرحلة الابتدائية', 'المرحلة الإعدادية', 'المرحلة الثانوية'], required: true },
  grade: { type: String, required: true },
  username: { type: String, required: true, unique: true, trim: true, minlength: 4, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  role: { type: String, enum: ['student', 'admin'], default: 'student' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  isActive: { type: Boolean, default: true },
  lastLogin: Date
}, { timestamps: true });

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcryptjs.hash(this.password, 10);
  next();
});

UserSchema.methods.matchPassword = async function(entered) {
  return await bcryptjs.compare(entered, this.password);
};

const LessonSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  stage: { type: String, enum: ['المرحلة الابتدائية', 'المرحلة الإعدادية', 'المرحلة الثانوية'], required: true },
  grade: { type: String, required: true },
  content: { type: String, required: true },
  videoUrl: String,
  pdfUrl: String,
  driveUrl: String,
  isPublished: { type: Boolean, default: true }
}, { timestamps: true });

const QuestionSchema = new mongoose.Schema({
  questionText: String,
  options: [String],
  correctAnswerIndex: Number,
  points: { type: Number, default: 1 }
});

const ExamSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  stage: { type: String, enum: ['المرحلة الابتدائية', 'المرحلة الإعدادية', 'المرحلة الثانوية'], required: true },
  grade: { type: String, required: true },
  questions: [QuestionSchema],
  totalPoints: { type: Number, default: 0 },
  duration: { type: Number, default: 60 },
  isPublished: { type: Boolean, default: true }
}, { timestamps: true });

ExamSchema.pre('save', function(next) {
  this.totalPoints = this.questions.reduce((sum, q) => sum + (q.points || 1), 0);
  next();
});

const ResultSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  studentName: String,
  studentUsername: String,
  exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  examTitle: String,
  score: { type: Number, required: true },
  total: { type: Number, required: true },
  percentage: { type: Number, default: 0 },
  grade: String,
  status: { type: String, enum: ['passed', 'failed'] },
  answers: Array
}, { timestamps: true });

ResultSchema.pre('save', function(next) {
  this.percentage = (this.score / this.total) * 100;
  if (this.percentage >= 90) this.grade = 'A';
  else if (this.percentage >= 80) this.grade = 'B';
  else if (this.percentage >= 70) this.grade = 'C';
  else if (this.percentage >= 60) this.grade = 'D';
  else this.grade = 'F';
  this.status = this.percentage >= 50 ? 'passed' : 'failed';
  next();
});

const User = mongoose.model('User', UserSchema);
const Lesson = mongoose.model('Lesson', LessonSchema);
const Exam = mongoose.model('Exam', ExamSchema);
const Result = mongoose.model('Result', ResultSchema);

// ===================== Auth Middleware ======================
const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) return res.status(401).json({ success: false, message: 'لم يتم توفير توكن' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(decoded.id);
    if (!req.user || !req.user.isActive) return res.status(401).json({ success: false, message: 'الحساب غير موجود أو معطل' });
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'توكن غير صالح' });
  }
};

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  res.status(403).json({ success: false, message: 'ليس لديك صلاحية' });
};

// ===================== Init Admin ======================
const initAdmin = async () => {
  try {
    await User.deleteMany({ username: 'admin', role: 'admin' });
    const admin = new User({
      name: 'أ/أحمد عكاشة',
      username: 'admin',
      password: 'adminpassword123',
      phone: '01110370462',
      stage: 'المرحلة الثانوية',
      grade: 'الصف الثالث الثانوي',
      role: 'admin',
      status: 'approved'
    });
    await admin.save();
    console.log('✅ تم إنشاء/تحديث حساب المعلم الافتراضي');
    console.log('👤 admin / 🔑 adminpassword123');
  } catch (err) {
    console.error('❌ خطأ في إنشاء الأدمن:', err.message);
  }
};

// ===================== API Routes ======================

// Auth
app.post('/api/register', async (req, res) => {
  try {
    const { name, phone, parentPhone, stage, grade, username, password } = req.body;
    const existing = await User.findOne({ username: username.toLowerCase().trim() });
    if (existing) return res.status(409).json({ success: false, message: 'اسم المستخدم مسجل مسبقاً!' });
    const user = new User({ name, phone, parentPhone, stage, grade, username, password, role: 'student', status: 'pending' });
    await user.save();
    res.status(201).json({ success: true, message: 'تم إرسال طلب الانضمام بنجاح! بانتظار موافقة المعلم.' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const cleanUser = (username || '').toString().trim().toLowerCase();
    const cleanPass = (password || '').toString().trim();
    console.log(`🔍 محاولة دخول: "${cleanUser}"`);
    const user = await User.findOne({ $or: [{ username: cleanUser }, { phone: cleanUser }] });
    if (!user) {
      console.log(`❌ المستخدم غير موجود`);
      return res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    const isMatch = await user.matchPassword(cleanPass);
    if (!isMatch) {
      console.log(`❌ كلمة المرور خاطئة`);
      return res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    if (user.role === 'student' && user.status !== 'approved') {
      return res.status(403).json({ success: false, message: 'حسابك قيد التفعيل والقبول من المعلم' });
    }
    user.lastLogin = new Date();
    await user.save();
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    console.log(`🎉 دخول ناجح: ${user.name}`);
    res.json({
      success: true, message: 'تم تسجيل الدخول بنجاح', token,
      user: { _id: user._id, name: user.name, username: user.username, role: user.role, status: user.status, grade: user.grade, stage: user.stage }
    });
  } catch (error) {
    console.error('❌ خطأ في الدخول:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Lessons
app.get('/api/lessons', async (req, res) => {
  try {
    const filter = req.query.grade ? { grade: req.query.grade, isPublished: true } : { isPublished: true };
    const lessons = await Lesson.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, count: lessons.length, data: lessons });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/lessons', protect, isAdmin, upload.single('pdfFile'), async (req, res) => {
  try {
    const { title, stage, grade, content, videoUrl, driveUrl } = req.body;
    const host = req.get('host');
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const lesson = new Lesson({
      title, stage, grade, content, videoUrl, driveUrl,
      pdfUrl: req.file ? `${protocol}://${host}/uploads/${req.file.filename}` : null,
      createdBy: req.user._id
    });
    await lesson.save();
    res.status(201).json({ success: true, message: 'تم نشر الدرس بنجاح!' });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

app.delete('/api/lessons/:id', protect, isAdmin, async (req, res) => {
  try { await Lesson.findByIdAndDelete(req.params.id); res.json({ success: true, message: 'تم حذف الدرس!' }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// Exams
app.get('/api/exams', async (req, res) => {
  try {
    const filter = req.query.grade ? { grade: req.query.grade, isPublished: true } : { isPublished: true };
    const exams = await Exam.find(filter).sort({ createdAt: -1 }).select('-questions.correctAnswerIndex');
    res.json({ success: true, count: exams.length, data: exams });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/exams/:id', async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id).select('-questions.correctAnswerIndex');
    if (!exam) return res.status(404).json({ success: false, message: 'الامتحان غير موجود' });
    res.json({ success: true, data: exam });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/exams', protect, isAdmin, async (req, res) => {
  try {
    const { title, stage, grade, questions } = req.body;
    const exam = new Exam({ title, stage, grade, questions, createdBy: req.user._id, isPublished: true });
    await exam.save();
    res.status(201).json({ success: true, message: 'تم نشر الامتحان بنجاح!' });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

app.delete('/api/exams/:id', protect, isAdmin, async (req, res) => {
  try {
    await Exam.findByIdAndDelete(req.params.id);
    await Result.deleteMany({ exam: req.params.id });
    res.json({ success: true, message: 'تم حذف الامتحان!' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/exams/:id/submit', protect, async (req, res) => {
  try {
    const { answers } = req.body;
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'الامتحان غير موجود' });
    let score = 0;
    const answersDetail = [];
    exam.questions.forEach((q, idx) => {
      const isCorrect = answers[idx] === q.correctAnswerIndex;
      score += isCorrect ? (q.points || 1) : 0;
      answersDetail.push({ questionIndex: idx, selectedAnswer: answers[idx], isCorrect, earnedPoints: isCorrect ? (q.points || 1) : 0 });
    });
    const result = new Result({
      student: req.user._id, studentName: req.user.name, studentUsername: req.user.username,
      exam: req.params.id, examTitle: exam.title, score, total: exam.totalPoints, answers: answersDetail
    });
    await result.save();
    res.status(201).json({
      success: true, message: 'تم التسليم!',
      score, total: exam.totalPoints, percentage: result.percentage, grade: result.grade, status: result.status
    });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// Admin
app.get('/api/admin/pending-students', protect, isAdmin, async (req, res) => {
  try { const students = await User.find({ role: 'student', status: 'pending' }).select('-password'); res.json({ success: true, count: students.length, data: students }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/approved-students', protect, isAdmin, async (req, res) => {
  try { const students = await User.find({ role: 'student', status: 'approved' }).select('-password'); res.json({ success: true, count: students.length, data: students }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/admin/approve-student', protect, isAdmin, async (req, res) => {
  try { await User.findByIdAndUpdate(req.body.studentId, { status: 'approved' }); res.json({ success: true, message: 'تم تفعيل حساب الطالب!' }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.delete('/api/admin/students/:id', protect, isAdmin, async (req, res) => {
  try { await User.findByIdAndDelete(req.params.id); res.json({ success: true, message: 'تم إزالة العضو!' }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/results', protect, isAdmin, async (req, res) => {
  try {
    const results = await Result.find().populate('student', 'name username').populate('exam', 'title').sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/health', (req, res) => res.json({ success: true, message: 'السيرفر يعمل ✅' }));

// ===================== Database Connection ======================
let connected = false;
const connectDB = async () => {
  if (connected) return;
  await mongoose.connect(MONGO_URI);
  connected = true;
  console.log('✅ متصل بقاعدة البيانات');
  await initAdmin();
};

// Connect on first request (Vercel serverless)
app.use(async (req, res, next) => {
  try { await connectDB(); next(); }
  catch (err) { res.status(500).json({ success: false, message: 'خطأ في الاتصال بقاعدة البيانات' }); }
});

module.exports = app;
