"use client";

/** تصدير صفوف إلى ملف Excel (تحميل كسول للمكتبة) */
export async function exportExcel(fileName: string, sheet: string, rows: Record<string, string | number | null>[]) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = Object.keys(rows[0] || {}).map((k) => ({ wch: Math.max(10, Math.min(48, k.length + 6, ...rows.slice(0, 200).map((r) => String(r[k] ?? "").length + 2))) }));
  // اتجاه الورقة من اليمين لليسار
  (ws as unknown as { "!views": unknown[] })["!views"] = [{ RTL: true }];
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
  XLSX.writeFile(wb, `${fileName.replace(/[\\/:*?"<>|]+/g, "_")}.xlsx`);
}

export function downloadJSON(fileName: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
