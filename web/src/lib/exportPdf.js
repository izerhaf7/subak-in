import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const PAGE_WIDTH_MM = 210; // A4 portrait
const PAGE_HEIGHT_MM = 297;
const MARGIN_MM = 10;

// Snapshots `element` and writes it into a multi-page A4 PDF, slicing the
// tall source canvas across as many pages as needed rather than squeezing
// or cropping. Downloads the result as `${fileNameHint}.pdf`.
export async function exportLaporanToPdf(element, fileNameHint) {
  const canvas = await html2canvas(element, { scale: 2, backgroundColor: "#ffffff" });

  const contentWidthMm = PAGE_WIDTH_MM - MARGIN_MM * 2;
  const contentHeightMm = PAGE_HEIGHT_MM - MARGIN_MM * 2;
  const pxPerMm = canvas.width / contentWidthMm;
  const pageHeightPx = contentHeightMm * pxPerMm;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let renderedPx = 0;
  let pageIndex = 0;

  while (renderedPx < canvas.height) {
    const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeightPx;
    pageCanvas.getContext("2d").drawImage(
      canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx
    );

    if (pageIndex > 0) doc.addPage();
    doc.addImage(
      pageCanvas.toDataURL("image/png"), "PNG",
      MARGIN_MM, MARGIN_MM, contentWidthMm, sliceHeightPx / pxPerMm
    );

    renderedPx += sliceHeightPx;
    pageIndex += 1;
  }

  doc.save(`${fileNameHint}.pdf`);
}
