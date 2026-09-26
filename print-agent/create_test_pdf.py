#!/usr/bin/env python3
"""
Creates a minimal valid PDF 1.4 file without requiring external libraries.
Used for Milestone 1 standalone testing of the Windows Print Agent.
"""

def generate_minimal_pdf(output_path="test_sample.pdf"):
    pdf_content = (
        b"%PDF-1.4\n"
        b"1 0 obj\n"
        b"<< /Type /Catalog /Pages 2 0 R >>\n"
        b"endobj\n"
        b"2 0 obj\n"
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n"
        b"endobj\n"
        b"3 0 obj\n"
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\n"
        b"endobj\n"
        b"4 0 obj\n"
        b"<< /Length 135 >>\n"
        b"stream\n"
        b"BT\n"
        b"/F1 24 Tf\n"
        b"50 720 Td\n"
        b"(Xerox Print Shop - Test Document) Tj\n"
        b"/F1 14 Tf\n"
        b"0 -40 Td\n"
        b"(Milestone 1: Python -> Windows -> Print Spooler -> Printer) Tj\n"
        b"0 -30 Td\n"
        b"(Success! Physical printer communication verified.) Tj\n"
        b"ET\n"
        b"endstream\n"
        b"endobj\n"
        b"5 0 obj\n"
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n"
        b"endobj\n"
        b"xref\n"
        b"0 6\n"
        b"0000000000 65535 f \n"
        b"0000000009 00000 n \n"
        b"0000000058 00000 n \n"
        b"0000000115 00000 n \n"
        b"0000000244 00000 n \n"
        b"0000000431 00000 n \n"
        b"trailer\n"
        b"<< /Size 6 /Root 1 0 R >>\n"
        b"startxref\n"
        b"510\n"
        b"%%EOF\n"
    )

    with open(output_path, "wb") as f:
        f.write(pdf_content)

    print(f"Created sample PDF at: {output_path} ({len(pdf_content)} bytes)")

if __name__ == "__main__":
    generate_minimal_pdf()
