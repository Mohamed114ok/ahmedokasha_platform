'use strict';

/*
 * ============================================================
 * منصة أ/ أحمد عكاشة - JavaScript
 * ============================================================
 *
 * جميع أكواد JavaScript موجودة هنا بدلًا من inline <script>
 * حتى تعمل المنصة مع Content Security Policy الخاصة بـ Helmet.
 *
 * ============================================================
 */

const API_URL = `${window.location.origin}/api`;

let currentUser = null;
let currentTab = 'register';


/* ============================================================
   أدوات عامة
   ============================================================ */

/**
 * حماية النصوص قبل وضعها داخل innerHTML
 * لمنع HTML / XSS غير المرغوب فيه.
 */
function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


/**
 * السماح فقط بروابط HTTP/HTTPS.
 */
function safeUrl(value) {
  if (!value) {
    return '';
  }

  try {
    const url = new URL(value, window.location.origin);

    if (
      url.protocol !== 'http:' &&
      url.protocol !== 'https:'
    ) {
      return '';
    }

    return url.href;
  } catch {
    return '';
  }
}


/**
 * عرض رسالة للمستخدم.
 */
function showAlert(msg, isError = false) {
  const box = document.getElementById('alertBox');

  if (!box) {
    return;
  }

  box.className = isError
    ? 'alert alert-error'
    : 'alert alert-success';

  box.textContent = msg || 'حدث خطأ';

  box.classList.remove('hidden');

  setTimeout(() => {
    box.classList.add('hidden');
  }, 5000);
}


/**
 * تغيير التبويب الحالي.
 */
function showTab(tab) {
  const section = document.getElementById(`section-${tab}`);
  const button = document.getElementById(`tab-${tab}`);

  if (!section || !button) {
    return;
  }

  document
    .querySelectorAll('[id^="section-"]')
    .forEach((el) => {
      el.classList.add('hidden');
    });

  document
    .querySelectorAll('nav button')
    .forEach((btn) => {
      btn.classList.remove('active');
    });

  section.classList.remove('hidden');
  button.classList.add('active');

  currentTab = tab;

  if (tab === 'lessons') {
    loadLessons();
  }

  if (tab === 'exams') {
    loadExams();
  }

  if (tab === 'admin') {
    loadAdminData();
  }
}


/* ============================================================
   API
   ============================================================ */

/**
 * الاتصال بالـ API.
 *
 * ملاحظة مهمة:
 * لا نضع Content-Type: application/json
 * إذا كان body عبارة عن FormData.
 */
async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('token');

  const headers = {
    ...(options.headers || {})
  };

  /*
   * FormData تقوم بنفسها بتحديد Content-Type
   * مع boundary الخاص بالملف.
   */
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const fetchOptions = {
    method: options.method || 'GET',
    headers
  };

  if (options.body !== undefined) {
    fetchOptions.body = options.body;
  }

  console.log('API Call:', endpoint, {
    method: fetchOptions.method
  });

  const res = await fetch(
    API_URL + endpoint,
    fetchOptions
  );

  const contentType =
    res.headers.get('content-type') || '';

  let data;

  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const message =
      typeof data === 'object'
        ? data?.message
        : data;

    throw new Error(
      message || 'خطأ في الطلب'
    );
  }

  return data;
}


/* ============================================================
   Navigation
   ============================================================ */

function updateNav() {
  const token = localStorage.getItem('token');

  const tabs = [
    'register',
    'login',
    'lessons',
    'exams',
    'admin',
    'logout'
  ];

  tabs.forEach((tab) => {
    const element =
      document.getElementById(`tab-${tab}`);

    if (element) {
      element.classList.add('hidden');
    }
  });

  const userInfo =
    document.getElementById('userInfo');

  if (!token) {

    document
      .getElementById('tab-register')
      ?.classList.remove('hidden');

    document
      .getElementById('tab-login')
      ?.classList.remove('hidden');

    userInfo?.classList.add('hidden');

    return;
  }

  document
    .getElementById('tab-lessons')
    ?.classList.remove('hidden');

  document
    .getElementById('tab-exams')
    ?.classList.remove('hidden');

  if (currentUser?.role === 'admin') {
    document
      .getElementById('tab-admin')
      ?.classList.remove('hidden');
  }

  document
    .getElementById('tab-logout')
    ?.classList.remove('hidden');

  if (userInfo) {
    userInfo.classList.remove('hidden');

    const role =
      currentUser?.role === 'admin'
        ? 'معلم'
        : 'طالب';

    userInfo.textContent =
      `👤 ${currentUser?.name || ''} (${role})`;
  }
}


function logout() {
  localStorage.removeItem('token');

  currentUser = null;

  updateNav();

  showTab('register');

  showAlert('تم تسجيل الخروج');
}


/* ============================================================
   التسجيل
   ============================================================ */

async function handleRegister(event) {
  event.preventDefault();

  try {

    const registerData = {
      name:
        document
          .getElementById('regName')
          .value
          .trim(),

      phone:
        document
          .getElementById('regPhone')
          .value
          .trim(),

      parentPhone:
        document
          .getElementById('regParentPhone')
          .value
          .trim(),

      stage:
        document
          .getElementById('regStage')
          .value,

      grade:
        document
          .getElementById('regGrade')
          .value,

      username:
        document
          .getElementById('regUsername')
          .value
          .trim(),

      password:
        document
          .getElementById('regPassword')
          .value
    };


    if (
      !registerData.name ||
      !registerData.phone ||
      !registerData.stage ||
      !registerData.grade ||
      !registerData.username ||
      !registerData.password
    ) {
      showAlert(
        'أملأ جميع الحقول المطلوبة',
        true
      );

      return;
    }


    await apiFetch('/register', {
      method: 'POST',

      body: JSON.stringify(
        registerData
      )
    });


    showAlert(
      'تم الطلب بنجاح! بانتظار موافقة المعلم 📋'
    );

    event.target.reset();


    setTimeout(() => {
      showTab('login');
    }, 2000);

  } catch (err) {

    console.error(
      'Register error:',
      err
    );

    showAlert(
      err.message || 'خطأ في التسجيل',
      true
    );
  }
}


/* ============================================================
   تسجيل الدخول
   ============================================================ */

async function handleLogin(event) {
  event.preventDefault();

  try {

    const username =
      document
        .getElementById('loginUsername')
        .value
        .trim();

    const password =
      document
        .getElementById('loginPassword')
        .value
        .trim();


    if (!username || !password) {
      showAlert(
        'أدخل اسم المستخدم وكلمة المرور',
        true
      );

      return;
    }


    const data = await apiFetch(
      '/login',
      {
        method: 'POST',

        body: JSON.stringify({
          username,
          password
        })
      }
    );


    if (data.token && data.user) {

      localStorage.setItem(
        'token',
        data.token
      );

      currentUser = data.user;

      updateNav();

      showTab(
        currentUser.role === 'admin'
          ? 'admin'
          : 'lessons'
      );

      showAlert(
        'تم الدخول بنجاح! 🎉'
      );

      event.target.reset();

    } else {

      showAlert(
        'بيانات الدخول غير صحيحة',
        true
      );
    }

  } catch (err) {

    console.error(
      'Login error:',
      err
    );

    showAlert(
      err.message ||
        'خطأ في الدخول. تأكد من البيانات',
      true
    );
  }
}


/* ============================================================
   الدروس
   ============================================================ */

async function loadLessons() {
  try {

    const lessons =
      await apiFetch('/lessons');


    const html = lessons
      .map((lesson) => {

        const videoUrl =
          safeUrl(lesson.videoUrl);

        const pdfUrl =
          safeUrl(lesson.pdfUrl);

        const driveUrl =
          safeUrl(lesson.driveUrl);


        return `
          <div class="lesson-card">

            <h3>
              ${escapeHtml(lesson.title)}
            </h3>

            <p>
              ${escapeHtml(lesson.content || '')}
            </p>

            ${
              videoUrl
                ? `
                  <a
                    class="lesson-link"
                    href="${escapeHtml(videoUrl)}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    🎥 فيديو
                  </a>
                `
                : ''
            }

            ${
              pdfUrl
                ? `
                  <a
                    class="lesson-link"
                    href="${escapeHtml(pdfUrl)}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    📄 PDF
                  </a>
                `
                : ''
            }

            ${
              driveUrl
                ? `
                  <a
                    class="lesson-link"
                    href="${escapeHtml(driveUrl)}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    📁 Google Drive
                  </a>
                `
                : ''
            }

          </div>
        `;
      })
      .join('');


    const lessonsList =
      document.getElementById(
        'lessonsList'
      );

    if (lessonsList) {
      lessonsList.innerHTML =
        html || '<p>لا توجد دروس</p>';
    }

  } catch (err) {

    console.error(
      'Load lessons error:',
      err
    );

    showAlert(
      err.message,
      true
    );
  }
}


/* ============================================================
   الامتحانات
   ============================================================ */

async function loadExams() {
  try {

    const exams =
      await apiFetch('/exams');


    const html = exams
      .map((exam) => {

        return `
          <div
            class="exam-card"
            data-action="start-exam"
            data-id="${escapeHtml(exam._id)}"
            tabindex="0"
            role="button"
            aria-label="بدء امتحان ${escapeHtml(exam.title)}"
          >

            <h3>
              ${escapeHtml(exam.title)}
            </h3>

            <p>
              عدد الأسئلة:
              ${exam.questions?.length || 0}
            </p>

            <button
              type="button"
              class="btn"
              style="margin-top:10px;"
              data-action="start-exam-button"
              data-id="${escapeHtml(exam._id)}"
            >
              ⏱️ ابدأ الامتحان
            </button>

          </div>
        `;
      })
      .join('');


    const examsList =
      document.getElementById(
        'examsList'
      );

    if (examsList) {
      examsList.innerHTML =
        html || '<p>لا توجد امتحانات</p>';
    }

  } catch (err) {

    console.error(
      'Load exams error:',
      err
    );

    showAlert(
      err.message,
      true
    );
  }
}


/**
 * بدء الامتحان.
 */
async function startExam(id) {
  try {

    if (!id) {
      showAlert(
        'معرف الامتحان غير صحيح',
        true
      );

      return;
    }


    const exam =
      await apiFetch(
        `/exams/${encodeURIComponent(id)}`
      );


    const area =
      document.getElementById(
        'examsList'
      );


    if (!area) {
      return;
    }


    const questions =
      Array.isArray(exam.questions)
        ? exam.questions
        : [];


    if (!questions.length) {

      showAlert(
        'هذا الامتحان لا يحتوي على أسئلة',
        true
      );

      return;
    }


    area.innerHTML = `
      <h2>
        ${escapeHtml(exam.title)}
      </h2>

      <form id="examForm">

        ${questions
          .map((question, index) => {

            return `
              <div class="question-card">

                <h4>
                  ${index + 1}.
                  ${escapeHtml(
                    question.questionText
                  )}
                </h4>

                ${
                  (question.options || [])
                    .map((option, optionIndex) => {

                      return `
                        <label class="question-option">

                          <input
                            type="radio"
                            name="q${index}"
                            value="${optionIndex}"
                            required
                          >

                          ${escapeHtml(option)}

                        </label>
                      `;
                    })
                    .join('')
                }

              </div>
            `;
          })
          .join('')}


        <button
          type="submit"
          class="btn exam-submit"
        >
          ✅ تسليم الإجابات
        </button>

      </form>
    `;


    const examForm =
      document.getElementById(
        'examForm'
      );


    examForm?.addEventListener(
      'submit',
      async (event) => {

        event.preventDefault();

        try {

          const answers =
            questions.map(
              (_, index) => {

                const selected =
                  document.querySelector(
                    `input[name="q${index}"]:checked`
                  );

                return selected
                  ? parseInt(
                      selected.value,
                      10
                    )
                  : -1;
              }
            );


          const result =
            await apiFetch(
              `/exams/${encodeURIComponent(id)}/submit`,
              {
                method: 'POST',

                body: JSON.stringify({
                  answers
                })
              }
            );


          const messageClass =
            result.isPassed
              ? 'passed'
              : 'failed';


          area.innerHTML = `
            <div class="result-container">

              <h2>
                ✅ تم التسليم!
              </h2>

              <div class="result-percentage">

                ${escapeHtml(result.score)}
                /
                ${escapeHtml(result.totalScore)}

                (${escapeHtml(result.percentage)}%)

              </div>

              <p class="result-message ${messageClass}">
                ${escapeHtml(result.message)}
              </p>

              <button
                type="button"
                id="backToExamsBtn"
                class="btn back-exams-btn"
              >
                العودة للامتحانات
              </button>

            </div>
          `;


          document
            .getElementById(
              'backToExamsBtn'
            )
            ?.addEventListener(
              'click',
              () => {
                showTab('exams');
              }
            );

        } catch (err) {

          console.error(
            'Submit exam error:',
            err
          );

          showAlert(
            err.message,
            true
          );
        }
      }
    );

  } catch (err) {

    console.error(
      'Start exam error:',
      err
    );

    showAlert(
      err.message,
      true
    );
  }
}


/* ============================================================
   لوحة المعلم
   ============================================================ */

function loadAdminData() {
  loadPending();
  loadApproved();
  loadStats();
  loadResults();
}


/* ============================================================
   الطلاب المعلقون
   ============================================================ */

async function loadPending() {
  try {

    const users =
      await apiFetch(
        '/admin/pending-students'
      ).catch(() => []);


    const html =
      users
        .map((user) => {

          return `
            <tr>

              <td>
                ${escapeHtml(user.name)}
              </td>

              <td>
                ${escapeHtml(user.grade)}
              </td>

              <td>
                ${escapeHtml(user.phone)}
              </td>

              <td>

                <button
                  type="button"
                  class="btn action-btn"
                  data-action="approve-student"
                  data-id="${escapeHtml(user._id)}"
                >
                  قبول
                </button>

              </td>

            </tr>
          `;
        })
        .join('');


    const table =
      document.getElementById(
        'pendingStudentsTable'
      );


    if (table) {
      table.innerHTML =
        html ||
        '<tr><td colspan="4">لا يوجد</td></tr>';
    }

  } catch (err) {

    console.error(
      'Load pending students error:',
      err
    );

    showAlert(
      err.message,
      true
    );
  }
}


/* ============================================================
   الطلاب المقبولون
   ============================================================ */

async function loadApproved() {
  try {

    const users =
      await apiFetch(
        '/admin/approved-students'
      ).catch(() => []);


    const html =
      users
        .map((user) => {

          return `
            <tr>

              <td>
                ${escapeHtml(user.name)}
              </td>

              <td>
                ${escapeHtml(user.grade)}
              </td>

              <td>
                ${escapeHtml(user.phone)}
              </td>

              <td>

                <button
                  type="button"
                  class="btn btn-danger action-btn"
                  data-action="delete-student"
                  data-id="${escapeHtml(user._id)}"
                >
                  حذف
                </button>

              </td>

            </tr>
          `;
        })
        .join('');


    const table =
      document.getElementById(
        'approvedStudentsTable'
      );


    if (table) {
      table.innerHTML =
        html ||
        '<tr><td colspan="4">لا يوجد</td></tr>';
    }

  } catch (err) {

    console.error(
      'Load approved students error:',
      err
    );

    showAlert(
      err.message,
      true
    );
  }
}


/* ============================================================
   الإحصائيات
   ============================================================ */

async function loadStats() {
  try {

    const stats =
      await apiFetch(
        '/admin/stats'
      ).catch(() => ({}));


    const grid =
      document.getElementById(
        'statsGrid'
      );


    if (!grid) {
      return;
    }


    grid.innerHTML = `

      <div class="stat-card">

        <h3>
          ${Number(
            stats.approvedStudentsCount || 0
          )}
        </h3>

        <p>
          الطلاب المقبولون
        </p>

      </div>


      <div class="stat-card">

        <h3>
          ${Number(
            stats.pendingStudentsCount || 0
          )}
        </h3>

        <p>
          طلاب معلقون
        </p>

      </div>


      <div class="stat-card">

        <h3>
          ${Number(
            stats.lessonsCount || 0
          )}
        </h3>

        <p>
          الدروس
        </p>

      </div>


      <div class="stat-card">

        <h3>
          ${Number(
            stats.examsCount || 0
          )}
        </h3>

        <p>
          الامتحانات
        </p>

      </div>

    `;

  } catch (err) {

    console.error(
      'Load stats error:',
      err
    );

    showAlert(
      err.message,
      true
    );
  }
}


/* ============================================================
   النتائج
   ============================================================ */

async function loadResults() {
  try {

    const results =
      await apiFetch(
        '/admin/results'
      ).catch(() => []);


    const html =
      results
        .slice(0, 10)
        .map((result) => {

          const date =
            result.createdAt
              ? new Date(
                  result.createdAt
                ).toLocaleDateString(
                  'ar-EG'
                )
              : '-';


          return `
            <tr>

              <td>
                ${escapeHtml(
                  result.studentName
                )}
              </td>

              <td>
                ${escapeHtml(
                  result.examTitle
                )}
              </td>

              <td>
                ${escapeHtml(result.score)}
                /
                ${escapeHtml(result.total)}
              </td>

              <td>
                ${escapeHtml(date)}
              </td>

            </tr>
          `;
        })
        .join('');


    const table =
      document.getElementById(
        'resultsTable'
      );


    if (table) {
      table.innerHTML =
        html ||
        '<tr><td colspan="4">لا توجد نتائج</td></tr>';
    }

  } catch (err) {

    console.error(
      'Load results error:',
      err
    );

    showAlert(
      err.message,
      true
    );
  }
}


/* ============================================================
   قبول طالب
   ============================================================ */

async function approveStudent(id) {
  try {

    await apiFetch(
      `/admin/approve-student/${encodeURIComponent(id)}`,
      {
        method: 'POST'
      }
    );


    showAlert(
      'تم القبول'
    );


    await loadAdminData();

  } catch (err) {

    console.error(
      'Approve student error:',
      err
    );

    showAlert(
      err.message,
      true
    );
  }
}


/* ============================================================
   حذف طالب
   ============================================================ */

async function deleteStudent(id) {

  if (!window.confirm('هل أنت متأكد؟')) {
    return;
  }


  try {

    await apiFetch(
      `/admin/students/${encodeURIComponent(id)}`,
      {
        method: 'DELETE'
      }
    );


    showAlert(
      'تم الحذف'
    );


    await loadAdminData();

  } catch (err) {

    console.error(
      'Delete student error:',
      err
    );

    showAlert(
      err.message,
      true
    );
  }
}


/* ============================================================
   إضافة درس
   ============================================================ */

async function handleAddLesson(event) {
  event.preventDefault();

  try {

    const fd = new FormData();


    fd.append(
      'title',
      document
        .getElementById('lessonTitle')
        .value
        .trim()
    );


    fd.append(
      'stage',
      document
        .getElementById('lessonStage')
        .value
        .trim()
    );


    fd.append(
      'grade',
      document
        .getElementById('lessonGrade')
        .value
        .trim()
    );


    fd.append(
      'content',
      document
        .getElementById('lessonContent')
        .value
    );


    fd.append(
      'videoUrl',
      document
        .getElementById('lessonVideo')
        .value
        .trim()
    );


    fd.append(
      'driveUrl',
      document
        .getElementById('lessonDrive')
        .value
        .trim()
    );


    const fileInput =
      document.getElementById(
        'lessonPdfFile'
      );


    if (
      fileInput?.files &&
      fileInput.files[0]
    ) {

      fd.append(
        'pdfFile',
        fileInput.files[0]
      );
    }


    await apiFetch(
      '/admin/lessons',
      {
        method: 'POST',
        body: fd
      }
    );


    showAlert(
      'تم نشر الدرس'
    );


    event.target.reset();


    /*
     * تحديث قائمة الدروس إذا كان المستخدم
     * موجودًا في صفحة الدروس.
     */
    if (currentTab === 'lessons') {
      await loadLessons();
    }

  } catch (err) {

    console.error(
      'Add lesson error:',
      err
    );

    showAlert(
      err.message,
      true
    );
  }
}


/* ============================================================
   إضافة سؤال للامتحان
   ============================================================ */

function addQuestionField() {

  const container =
    document.getElementById(
      'questionsContainer'
    );


  if (!container) {
    return;
  }


  const idx =
    container.children.length;


  const div =
    document.createElement('div');


  div.className =
    'admin-question';


  div.innerHTML = `

    <h4>
      السؤال ${idx + 1}
    </h4>

    <input
      type="text"
      class="q-text"
      placeholder="نص السؤال"
      required
    >

    <div style="margin:10px 0;">

      ${[0, 1, 2, 3]
        .map((index) => {

          return `

            <div class="admin-option-row">

              <input
                type="radio"
                name="correct_${idx}"
                value="${index}"
                ${index === 0 ? 'checked' : ''}
                required
              >

              <input
                type="text"
                class="q-option-${index}"
                placeholder="خيار ${index + 1}"
                required
              >

            </div>

          `;
        })
        .join('')}

    </div>
  `;


  container.appendChild(div);
}


/* ============================================================
   إنشاء الامتحان
   ============================================================ */

async function handleAddExam(event) {
  event.preventDefault();

  try {

    const boxes =
      document.querySelectorAll(
        '#questionsContainer > div'
      );


    if (!boxes.length) {

      showAlert(
        'أضف سؤالاً واحداً على الأقل',
        true
      );

      return;
    }


    const questions =
      Array.from(boxes)
        .map((box, index) => {

          const selected =
            box.querySelector(
              `input[name="correct_${index}"]:checked`
            );


          if (!selected) {
            throw new Error(
              `اختر الإجابة الصحيحة للسؤال ${index + 1}`
            );
          }


          const questionText =
            box
              .querySelector('.q-text')
              ?.value
              .trim();


          const options =
            [0, 1, 2, 3]
              .map((optionIndex) => {

                return box
                  .querySelector(
                    `.q-option-${optionIndex}`
                  )
                  ?.value
                  .trim();
              });


          if (
            !questionText ||
            options.some(
              (option) => !option
            )
          ) {

            throw new Error(
              `أكمل بيانات السؤال ${index + 1}`
            );
          }


          return {

            questionText,

            options,

            correctAnswerIndex:
              parseInt(
                selected.value,
                10
              )
          };
        });


    await apiFetch(
      '/admin/exams',
      {
        method: 'POST',

        body: JSON.stringify({

          title:
            document
              .getElementById('examTitle')
              .value
              .trim(),

          stage:
            document
              .getElementById('examStage')
              .value
              .trim(),

          grade:
            document
              .getElementById('examGrade')
              .value
              .trim(),

          questions
        })
      }
    );


    showAlert(
      'تم إنشاء الامتحان'
    );


    event.target.reset();


    document.getElementById(
      'questionsContainer'
    ).innerHTML = '';


  } catch (err) {

    console.error(
      'Add exam error:',
      err
    );

    showAlert(
      err.message,
      true
    );
  }
}


/* ============================================================
   Event Delegation
   ============================================================ */

/**
 * التعامل مع الامتحانات التي يتم إنشاؤها
 * ديناميكيًا.
 */
function handleExamListClick(event) {

  const button =
    event.target.closest(
      '[data-action="start-exam-button"]'
    );


  if (button) {

    event.stopPropagation();

    const id =
      button.dataset.id;

    startExam(id);

    return;
  }


  const card =
    event.target.closest(
      '[data-action="start-exam"]'
    );


  if (card) {

    const id =
      card.dataset.id;

    startExam(id);
  }
}


/**
 * دعم Enter و Space لبطاقات الامتحانات.
 */
function handleExamListKeydown(event) {

  if (
    event.key !== 'Enter' &&
    event.key !== ' '
  ) {
    return;
  }


  const card =
    event.target.closest(
      '[data-action="start-exam"]'
    );


  if (!card) {
    return;
  }


  event.preventDefault();

  startExam(card.dataset.id);
}


/**
 * التعامل مع أزرار إدارة الطلاب.
 */
async function handleStudentTableClick(event) {

  const button =
    event.target.closest(
      '[data-action]'
    );


  if (!button) {
    return;
  }


  const action =
    button.dataset.action;

  const id =
    button.dataset.id;


  if (!id) {
    return;
  }


  if (
    action === 'approve-student'
  ) {

    button.disabled = true;

    await approveStudent(id);

    return;
  }


  if (
    action === 'delete-student'
  ) {

    button.disabled = true;

    await deleteStudent(id);
  }
}


/* ============================================================
   التهيئة
   ============================================================ */

function bindEvents() {

  /*
   * Navigation
   */
  document
    .getElementById('tab-register')
    ?.addEventListener(
      'click',
      () => showTab('register')
    );


  document
    .getElementById('tab-login')
    ?.addEventListener(
      'click',
      () => showTab('login')
    );


  document
    .getElementById('tab-lessons')
    ?.addEventListener(
      'click',
      () => showTab('lessons')
    );


  document
    .getElementById('tab-exams')
    ?.addEventListener(
      'click',
      () => showTab('exams')
    );


  document
    .getElementById('tab-admin')
    ?.addEventListener(
      'click',
      () => showTab('admin')
    );


  document
    .getElementById('tab-logout')
    ?.addEventListener(
      'click',
      logout
    );


  /*
   * Forms
   */
  document
    .getElementById('registerForm')
    ?.addEventListener(
      'submit',
      handleRegister
    );


  document
    .getElementById('loginForm')
    ?.addEventListener(
      'submit',
      handleLogin
    );


  document
    .getElementById('addLessonForm')
    ?.addEventListener(
      'submit',
      handleAddLesson
    );


  document
    .getElementById('addExamForm')
    ?.addEventListener(
      'submit',
      handleAddExam
    );


  /*
   * إضافة سؤال
   */
  document
    .getElementById('addQuestionBtn')
    ?.addEventListener(
      'click',
      addQuestionField
    );


  /*
   * الامتحانات الديناميكية
   */
  document
    .getElementById('examsList')
    ?.addEventListener(
      'click',
      handleExamListClick
    );


  document
    .getElementById('examsList')
    ?.addEventListener(
      'keydown',
      handleExamListKeydown
    );


  /*
   * جداول الطلاب
   */
  document
    .getElementById('pendingStudentsTable')
    ?.addEventListener(
      'click',
      handleStudentTableClick
    );


  document
    .getElementById('approvedStudentsTable')
    ?.addEventListener(
      'click',
      handleStudentTableClick
    );
}


/* ============================================================
   استعادة جلسة المستخدم
   ============================================================ */

async function initializeApp() {

  bindEvents();

  const token =
    localStorage.getItem('token');


  if (token) {

    try {

      const data =
        await apiFetch('/me');


      currentUser =
        data.user;


      showTab(
        currentUser.role === 'admin'
          ? 'admin'
          : 'lessons'
      );

    } catch (error) {

      console.warn(
        'Session restore failed:',
        error
      );

      localStorage.removeItem(
        'token'
      );

      currentUser = null;

      showTab('register');
    }
  }


  updateNav();
}


/*
 * لأن app.js يتم تحميله بـ defer،
 * فإن DOM يكون جاهزًا هنا.
 */
document.addEventListener(
  'DOMContentLoaded',
  initializeApp
);