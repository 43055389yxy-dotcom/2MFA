import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MFA 配置转换 | ITMS',
  description: '在浏览器本地安全地转换与解析 TOTP MFA 配置。',
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
