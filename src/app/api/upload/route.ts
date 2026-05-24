// POST /api/upload — multipart file upload, returns extracted text.
//
// The extracted text is sent back to the client which then re-submits it
// via /api/conversation/message. This keeps the file handling completely
// separate from the FSM and means the same code path handles paste + upload
// from the use case's point of view.

import { NextResponse } from "next/server";
import { textExtractor } from "@/shared/infrastructure/composition-root";
import { formatExtractionFailure } from "@/modules/screening/application/format-screening-reply";

export async function POST(request: Request): Promise<NextResponse> {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json(
      { error: "INVALID_FORM_DATA" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "MISSING_FILE", message: "Expected a 'file' field in multipart form data." },
      { status: 400 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await textExtractor.extract({
    bytes,
    mime: file.type || "application/octet-stream",
    sizeBytes: file.size,
  });

  if (!result.ok) {
    const status = result.error.kind === "TOO_LARGE" ? 413 : 400;
    return NextResponse.json(
      {
        error: result.error.kind,
        message: formatExtractionFailure(result.error),
      },
      { status },
    );
  }

  return NextResponse.json({ text: result.value });
}
