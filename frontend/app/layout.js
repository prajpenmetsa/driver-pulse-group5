import "./globals.css";
import { Inter } from "next/font/google";
import Sidebar from "../components/Sidebar";
import LanguageProvider from "../components/LanguageProvider";
import Header from "../components/Header";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Driver Pulse Dashboard",
  description: "Driver analytics dashboard for safety, earnings, and performance.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <LanguageProvider>
          <div className="app-shell">
            <Sidebar />
            <main className="main-content">
              <Header />
              <section className="page-content">{children}</section>
            </main>
          </div>
        </LanguageProvider>
      </body>
    </html>
  );
}