import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata={title:"ASR — African Sound Revolution",description:"Streaming, distribution and artist commerce."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}