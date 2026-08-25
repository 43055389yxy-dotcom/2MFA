import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MFA 动态验证码 | ITMS',
  description: '输入 MFA 密钥，在浏览器本地生成动态验证码。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
