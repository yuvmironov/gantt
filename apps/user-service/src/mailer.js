import nodemailer from 'nodemailer';

export function createMailer(env = process.env) {
  const smtpUrl = String(env.SMTP_URL ?? '').trim();
  const from = String(env.SMTP_FROM ?? 'SMART OATI <no-reply@smart-oati.local>');
  const transporter = smtpUrl ? nodemailer.createTransport(smtpUrl) : null;

  return {
    enabled: Boolean(transporter),
    async send({ to, subject, text }) {
      if (!transporter) return false;
      await transporter.sendMail({ from, to, subject, text });
      return true;
    },
  };
}
