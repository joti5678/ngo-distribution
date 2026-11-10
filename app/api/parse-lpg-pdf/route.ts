import { NextResponse } from 'next/server';
import PDFParser from 'pdf2json';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    return new Promise((resolve) => {
      // 1 (text mode) দিয়ে ইনিশিয়ালাইজ করা হলো, এটি অত্যন্ত দ্রুত এবং রিলায়েবল
      const pdfParser = new PDFParser(null, 1);

      pdfParser.on("pdfParser_dataError", (errData) => {
        console.error("PDF Parsing Error:", errData.parserError);
        resolve(NextResponse.json({ success: false, error: "Failed to extract PDF" }, { status: 500 }));
      });

      pdfParser.on("pdfParser_dataReady", () => {
        const rawText = pdfParser.getRawTextContent();
        
        // এক্সট্রাক্ট করা টেক্সটকে লাইন বাই লাইন ভাগ করা
        const lines = rawText
          .split(/\r?\n/)
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 0);

        resolve(NextResponse.json({ success: true, text: rawText, lines }));
      });

      // বাফার থেকে সরাসরি রিড করা শুরু
      pdfParser.parseBuffer(buffer);
    });
  } catch (error: any) {
    console.error("Server Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}