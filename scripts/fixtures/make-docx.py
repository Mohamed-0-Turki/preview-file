"""Generate real .docx fixtures with python-docx for Office View Engine verification."""

import os
import sys

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Emu, Inches, Pt, RGBColor

OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/opencode/fixtures"


def base_document():
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)
    return doc


def add_heading(doc, text, level):
    doc.add_heading(text, level=level)


def fixture_rich() -> str:
    """Headings, styles, alignment, indents, spacing, runs, hyperlinks, lists."""
    doc = base_document()
    doc.core_properties.title = "Office View Engine — rich text fixture"
    doc.core_properties.author = "preview-file"
    doc.core_properties.subject = "Paragraph & run fidelity"

    add_heading(doc, "Rich text fixture", 0)
    intro = doc.add_paragraph()
    intro.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = intro.add_run("Centred title paragraph with ")
    run.bold = True
    run.font.size = Pt(14)
    accent = intro.add_run("accented run")
    accent.font.color.rgb = RGBColor(0xC0, 0x39, 0x2B)
    accent.italic = True
    intro.add_run(" and a small-caps run").font.small_caps = True

    for align, label in (
        (WD_ALIGN_PARAGRAPH.LEFT, "left"),
        (WD_ALIGN_PARAGRAPH.RIGHT, "right"),
        (WD_ALIGN_PARAGRAPH.JUSTIFY, "justified"),
    ):
        p = doc.add_paragraph()
        p.alignment = align
        p.add_run(f"{label} aligned paragraph. ").bold = label == "justified"
        p.add_run(
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod "
            "tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim "
            "veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea "
            "commodo consequat."
        )

    add_heading(doc, "Heading level 2", 2)
    doc.add_paragraph(
        "Line spacing exact 18pt, space before 12pt, space after 6pt, first-line indent 0.5in.",
        style="Body Text",
    )
    spaced = doc.add_paragraph()
    spaced.paragraph_format.line_spacing = Pt(18)
    spaced.paragraph_format.space_before = Pt(12)
    spaced.paragraph_format.space_after = Pt(6)
    spaced.paragraph_format.first_line_indent = Inches(0.5)
    spaced.add_run(
        "Exactly 18pt line spacing with 12pt before, 6pt after and a half-inch first-line "
        "indent. " * 3
    )

    add_heading(doc, "Numbered and bulleted lists", 3)
    for _ in range(3):
        doc.add_paragraph("First level numbered item", style="List Number")
    for _ in range(3):
        doc.add_paragraph("First level bullet item", style="List Bullet")
    nested = doc.add_paragraph("Second level bullet item", style="List Bullet 2")
    nested.paragraph_format.left_indent = Inches(0.5)

    add_heading(doc, "Character formatting", 3)
    p = doc.add_paragraph()
    for text, kwargs in (
        ("bold ", {"bold": True}),
        ("italic ", {"italic": True}),
        ("underline ", {"underline": True}),
        ("strike ", {"strike": True}),
        ("superscript ", {"superscript": True}),
        ("subscript ", {"subscript": True}),
        ("highlighted ", {"highlight_color": 7}),
    ):
        r = p.add_run(text)
        for key, value in kwargs.items():
            setattr(r.font, key, value)
    p.add_run("size 24pt ").font.size = Pt(24)
    p.add_run("serif font ").font.name = "Georgia"
    p.add_run("green colored ").font.color.rgb = RGBColor(0x1E, 0x88, 0x45)

    add_heading(doc, "Table", 3)
    table = doc.add_table(rows=4, cols=4)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    headers = ("Name", "Role", "Sheets", "Notes")
    for i, text in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = ""
        run = cell.paragraphs[0].add_run(text)
        run.bold = True
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        shd = cell._tc.get_or_add_tcPr().makeelement(qn("w:shd"), {})
        shd.set(qn("w:val"), "clear")
        shd.set(qn("w:color"), "auto")
        shd.set(qn("w:fill"), "1F4E79")
        cell._tc.get_or_add_tcPr().append(shd)
    body = (
        ("Pipeline", "Parsing", "1", "ZIP + OPC"),
        ("Pipeline", "Model", "1", "renderer agnostic"),
        ("Pipeline", "Layout", "1", "measured, not guessed"),
    )
    for r, row in enumerate(body, start=1):
        for c, value in enumerate(row):
            table.rows[r].cells[c].text = value
    table.columns[0].width = Inches(1.4)
    table.columns[1].width = Inches(1.6)

    add_heading(doc, "Widths and shading", 3)
    t2 = doc.add_table(rows=2, cols=3)
    t2.style = "Light Grid Accent 1"
    fills = ("FDE9D9", "E2EFDA", "DDEBF7")
    for c in range(3):
        cell = t2.rows[0].cells[c]
        cell.text = f"Shaded {c + 1}"
        tc_pr = cell._tc.get_or_add_tcPr()
        shd = tc_pr.makeelement(qn("w:shd"), {})
        shd.set(qn("w:val"), "clear")
        shd.set(qn("w:color"), "auto")
        shd.set(qn("w:fill"), fills[c])
        tc_pr.append(shd)
    t2.rows[1].cells[0].text = "merged"
    t2.rows[1].cells[1].merge(t2.rows[1].cells[2])

    add_heading(doc, "Page break", 3)
    doc.add_paragraph("This paragraph is on page one.")
    doc.add_page_break()
    doc.add_paragraph("This paragraph is on page two after an explicit break.")
    doc.add_paragraph("Filler " * 220)

    return _save(doc, "rich-text.docx")


def fixture_long() -> str:
    """Multi-page prose: exercises real (measured) pagination, not explicit breaks."""
    doc = base_document()
    add_heading(doc, "Long form document", 1)
    for chapter in range(1, 7):
        add_heading(doc, f"Chapter {chapter}", 2)
        for para in range(5):
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            p.add_run(
                f"Section {chapter}.{para}. Lorem ipsum dolor sit amet, consectetur "
                "adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore "
                "magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco "
                "laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in "
                "reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur."
            )
    return _save(doc, "long-form.docx")


def fixture_landscape() -> str:
    """Landscape section with different page size + margins."""
    doc = base_document()
    section = doc.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width = Emu(10058400)
    section.page_height = Emu(7772400)
    section.left_margin = Inches(1.0)
    section.right_margin = Inches(1.0)
    section.top_margin = Inches(0.75)
    section.bottom_margin = Inches(0.75)
    add_heading(doc, "Landscape section", 1)
    doc.add_paragraph("Page size 11in x 8.5in with 1in side margins and 0.75in top/bottom.")
    return _save(doc, "landscape.docx")


def _save(doc, name) -> str:
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    doc.save(path)
    print(f"wrote {path} ({os.path.getsize(path)} bytes)")
    return path


if __name__ == "__main__":
    fixture_rich()
    fixture_long()
    fixture_landscape()
