declare module 'nodemailer' {
  import type { Transporter as NodemailerTransporter } from 'nodemailer/lib/mailer';
  const nodemailer: {
    createTransport(options?: any): NodemailerTransporter;
  };
  export default nodemailer;
}
