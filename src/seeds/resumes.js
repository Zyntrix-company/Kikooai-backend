import 'dotenv/config';
import pool from '../db/pool.js';

const JOB_SEEKER_EMAIL = 'jobseeker@kikoo.test';

const pairs = [
  {
    resume: {
      title:       'Software Engineer Resume',
      resume_text: `• Developed RESTful APIs using Node.js and Express, reducing response latency by 35%
• Led migration of monolithic codebase to microservices architecture serving 500k daily active users
• Implemented CI/CD pipelines with GitHub Actions, cutting deployment time from 2 hours to 15 minutes
• Mentored 3 junior engineers and conducted weekly code reviews to maintain code quality standards`,
    },
    job: {
      type:    'resume_analyze',
      jd_text: `Senior Software Engineer — Backend
We are looking for an experienced backend engineer to join our core platform team.
Requirements:
- 4+ years of experience with Node.js or similar server-side technologies
- Strong knowledge of RESTful API design and microservices
- Experience with CI/CD pipelines (GitHub Actions, Jenkins, or similar)
- Ability to mentor junior engineers and participate in code reviews
- Familiarity with PostgreSQL or other relational databases`,
    },
    analysis_type: 'analyze',
  },
  {
    resume: {
      title:       'Frontend Developer Resume',
      resume_text: `• Built responsive React dashboards consumed by 10,000+ enterprise clients
• Optimised bundle size by 40% through code splitting and lazy loading
• Integrated third-party payment gateways (Stripe, PayPal) following PCI-DSS guidelines
• Collaborated with UX designers to implement pixel-perfect prototypes from Figma`,
    },
    job: {
      type:    'resume_roast',
      jd_text: `Full-Stack Engineer — Product
We are building the next generation of SaaS tooling and need a versatile engineer.
Requirements:
- 3+ years with React or Vue; TypeScript a strong plus
- Backend exposure to Node.js, Python, or Go
- Experience integrating payment systems or other third-party APIs
- Strong communication and cross-functional collaboration skills`,
    },
    analysis_type: 'roast',
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    // Resolve job_seeker user
    const { rows: userRows } = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [JOB_SEEKER_EMAIL]
    );
    if (!userRows[0]) {
      throw new Error(`Job seeker user not found (${JOB_SEEKER_EMAIL}). Run seed:users first.`);
    }
    const userId = userRows[0].id;

    let inserted = 0;
    for (const pair of pairs) {
      // Idempotent: skip if resume title already exists for this user
      const { rows: existing } = await client.query(
        'SELECT id FROM resumes WHERE user_id = $1 AND title = $2',
        [userId, pair.resume.title]
      );
      if (existing[0]) {
        console.log(`[seed] Resume "${pair.resume.title}" already exists — skipping.`);
        continue;
      }

      // Insert resume row
      const { rows: resumeRows } = await client.query(
        `INSERT INTO resumes (user_id, title, json_blob)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [userId, pair.resume.title, JSON.stringify({ resume_text: pair.resume.resume_text })]
      );
      const resumeId = resumeRows[0].id;

      // Insert job row
      const { rows: jobRows } = await client.query(
        `INSERT INTO jobs (type, status, user_id, payload_ref)
         VALUES ($1, 'pending', $2, $3)
         RETURNING id`,
        [pair.job.type, userId, JSON.stringify({ resume_id: resumeId })]
      );
      const jobId = jobRows[0].id;

      // Insert resume_report
      await client.query(
        `INSERT INTO resume_reports (resume_id, job_id, jd_text, analysis_type, status)
         VALUES ($1, $2, $3, $4, 'pending')`,
        [resumeId, jobId, pair.job.jd_text, pair.analysis_type]
      );

      console.log(`[seed] Resume "${pair.resume.title}" + report (${pair.analysis_type}) created.`);
      inserted++;
    }

    console.log(`[seed] Done — inserted ${inserted} resume/report pairs.`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('[seed] Failed:', err.message);
  process.exit(1);
});
