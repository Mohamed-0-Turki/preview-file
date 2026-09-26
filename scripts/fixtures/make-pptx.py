"""Hand-build a .pptx that embeds a real DrawingML chart part (c:chartSpace),
a real image part and a table, plus a compositing slide that exercises nested
group transforms, rotation, cropping, arrows, transparency and z-order.

LibreOffice cannot author a chart-bearing .pptx from a flat ODF file, so the
package is assembled directly: [Content_Types].xml, the presentation part, one
slide master, one layout, four slides and the chart part with a cached
numCache/strCache — the same shape Office writes.
"""

import os
import struct
import sys
import zipfile
import zlib
from xml.etree import ElementTree

# Default next to this script so the conformance harness can fetch it, with an
# override for regenerating a throwaway copy elsewhere.
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ooxml-conformance")

EMU_PER_CM = 360000
SLIDE_W = 12192000  # 16:9
SLIDE_H = 6858000


def emu(cm):
    return int(round(cm * EMU_PER_CM))


def png_bytes(width, height, pixel):
    """Minimal 8-bit RGB PNG encoder — the fixture needs a real image part, and
    a generated one makes the expected pixel geometry known exactly."""
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0 (None)
        for x in range(width):
            raw.extend(pixel(x, y))

    def chunk(kind, data):
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def swatch(x, y):
    """Four quadrants plus a grid, so a wrong crop, flip or aspect shows up."""
    if x % 16 == 0 or y % 16 == 0:
        return (255, 255, 255)
    if x < 48 and y < 32:
        return (220, 30, 60)
    if x >= 48 and y < 32:
        return (30, 120, 220)
    if x < 48:
        return (250, 200, 40)
    return (30, 160, 90)


CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
<Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
<Override PartName="/ppt/slides/slide3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
<Override PartName="/ppt/slides/slide4.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
<Override PartName="/ppt/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>"""

ROOT_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>"""

PRESENTATION = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst>
<p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/><p:sldId id="258" r:id="rId4"/><p:sldId id="259" r:id="rId5"/>
</p:sldIdLst>
<p:sldSz cx="{SLIDE_W}" cy="{SLIDE_H}"/>
<p:notesSz cx="{SLIDE_H}" cy="{SLIDE_W}"/>
</p:presentation>"""

PRESENTATION_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide3.xml"/>
<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide4.xml"/>
<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>"""

THEME = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
<a:themeElements>
<a:clrScheme name="Office">
<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="44546A"/></a:dk2>
<a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
<a:accent1><a:srgbClr val="4472C4"/></a:accent1>
<a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
<a:accent4><a:srgbClr val="FFC000"/></a:accent4>
<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
<a:accent6><a:srgbClr val="70AD47"/></a:accent6>
<a:hlink><a:srgbClr val="0563C1"/></a:hlink>
<a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
</a:clrScheme>
<a:fontScheme name="Office">
<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
</a:fontScheme>
<a:fmtScheme name="Office">
<a:fillStyleLst>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"><a:tint val="60000"/></a:schemeClr></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"><a:shade val="80000"/></a:schemeClr></a:solidFill>
</a:fillStyleLst>
<a:lnStyleLst>
<a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
<a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
<a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
</a:lnStyleLst>
<a:effectStyleLst>
<a:effectStyle><a:effectLst/></a:effectStyle>
<a:effectStyle><a:effectLst/></a:effectStyle>
<a:effectStyle><a:effectLst/></a:effectStyle>
</a:effectStyleLst>
<a:bgFillStyleLst>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/></a:schemeClr></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"><a:shade val="93000"/></a:schemeClr></a:solidFill>
</a:bgFillStyleLst>
</a:fmtScheme>
</a:themeElements>
</a:theme>"""

MASTER_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>"""

EMPTY_TREE = """<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>"""


def ph(idx, name, ph_type=None):
    ph_xml = f'<p:ph type="{ph_type}" idx="{idx}"/>' if ph_type else f'<p:ph idx="{idx}"/>'
    return (
        '<p:sp><p:nvSpPr>'
        f'<p:cNvPr id="{100 + idx}" name="{name} {idx}"/>'
        '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>'
        f'<p:nvPr>{ph_xml}</p:nvPr></p:nvSpPr>'
        '<p:spPr/>'
        '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>'
    )


SLIDE_MASTER = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld name="Office Theme"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
{ph(1, "Title Placeholder", "title")}
{ph(2, "Text Placeholder", "body")}
</p:spTree></p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
<p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="4400" b="1"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle>
<p:bodyStyle><a:lvl1pPr marL="342900" indent="-342900"><a:buChar char="&#8226;"/><a:defRPr sz="2400"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr>
<a:lvl2pPr marL="742950" indent="-285750"><a:buChar char="&#111;"/><a:defRPr sz="2000"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl2pPr></p:bodyStyle>
<p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:otherStyle></p:txStyles>
</p:sldMaster>"""

def layout_ph(idx, name, ph_type, x, y, cx, cy, body_anchor="t", lst_style=""):
    """A layout placeholder: it carries the geometry the slide will inherit."""
    return (
        '<p:sp><p:nvSpPr>'
        f'<p:cNvPr id="{200 + idx}" name="{name} {idx}"/>'
        '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>'
        f'<p:nvPr><p:ph type="{ph_type}" idx="{idx}"/></p:nvPr></p:nvSpPr>'
        f'<p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm></p:spPr>'
        f'<p:txBody><a:bodyPr anchor="{body_anchor}"/><a:lstStyle>{lst_style}</a:lstStyle>'
        '<a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>'
    )


# The layout owns the placeholder geometry and narrows the master's text styles.
# Slides then carry `p:ph` and text with no `a:xfrm` and no `sz`, so anything
# they render correctly came through the master -> layout -> slide chain.
SLIDE_LAYOUT = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="obj" preserve="1">
<p:cSld name="Title and Content"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
{layout_ph(1, "Title Placeholder", "title", 457200, 274638, 10515600, 1325563, "ctr", '<a:lvl1pPr algn="l"><a:defRPr sz="3200"/></a:lvl1pPr>')}
{layout_ph(2, "Text Placeholder", "body", 457200, 1600200, 10515600, 4525963, "t", '<a:lvl1pPr marL="285750" indent="-285750"><a:defRPr sz="1800"/></a:lvl1pPr>')}
{layout_ph(3, "Bullets Placeholder", "body", 4114800, 2438400, 2743200, 1200150, "t", '<a:lvl1pPr marL="228600" indent="-228600"><a:buChar char="&#8226;"/><a:defRPr sz="1400"/></a:lvl1pPr><a:lvl2pPr marL="685800" indent="-228600"><a:buChar char="&#111;"/><a:defRPr sz="1200"/></a:lvl2pPr>')}
</p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>"""

SLIDE_LAYOUT_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>"""


def rect_shape(sid, name, x, y, cx, cy, fill=None, scheme=None, line=None, text=None, size="1800",
               align=None, prst="rect", bold=False):
    fill_xml = "<a:noFill/>"
    if scheme:
        fill_xml = f'<a:solidFill><a:schemeClr val="{scheme}"/></a:solidFill>'
    elif fill:
        fill_xml = f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>'
    line_xml = "<a:ln><a:noFill/></a:ln>"
    if line:
        line_xml = f'<a:ln w="19050"><a:solidFill><a:srgbClr val="{line}"/></a:solidFill></a:ln>'
    prst_attr = f' prst="{prst}"' if prst else ""
    align_attr = f' algn="{align}"' if align else ""
    body = (
        f'<a:p><a:pPr{align_attr}/><a:r><a:rPr lang="en-US" sz="{size}"'
        + (' b="1"' if bold else "")
        + f'><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>'
        f'<a:latin typeface="+mn-lt"/></a:rPr><a:t>{text}</a:t></a:r></a:p>'
        if text
        else "<a:p><a:endParaRPr lang=\"en-US\"/></a:p>"
    )
    return (
        '<p:sp><p:nvSpPr>'
        f'<p:cNvPr id="{sid}" name="{name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
        f'<p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>'
        f'<a:prstGeom{prst_attr}><a:avLst/></a:prstGeom>{fill_xml}{line_xml}</p:spPr>'
        f'<p:txBody><a:bodyPr lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="ctr"/><a:lstStyle/>{body}</p:txBody></p:sp>'
    )


def slide_ph(sid, name, ph_type, idx, paragraphs, anchor=None, extra_body=""):
    """A slide placeholder with **no** `a:xfrm` and no `sz` on its runs.

    Everything it renders — position, size, font size, bullet indent — therefore
    has to arrive through the master and the layout, which is the only way the
    inheritance chain is actually covered.
    """
    ph_xml = f'<p:ph type="{ph_type}" idx="{idx}"/>' if ph_type else f'<p:ph idx="{idx}"/>'
    anchor_attr = f' anchor="{anchor}"' if anchor else ""
    return (
        '<p:sp><p:nvSpPr>'
        f'<p:cNvPr id="{sid}" name="{name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>'
        f'<p:nvPr>{ph_xml}</p:nvPr></p:nvSpPr>'
        '<p:spPr/>'
        f'<p:txBody><a:bodyPr{anchor_attr}>{extra_body or "<a:normAutofit/>"}</a:bodyPr>'
        f'<a:lstStyle/>{"".join(paragraphs)}</p:txBody></p:sp>'
    )


def txbox(sid, name, x, y, cx, cy, paragraphs, anchor="t", wrap="square", autofit=False):
    body = "".join(paragraphs)
    fit = '<a:normAutofit/>' if autofit else '<a:noAutofit/>'
    return (
        '<p:sp><p:nvSpPr>'
        f'<p:cNvPr id="{sid}" name="{name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>'
        f'<p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>'
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>'
        f'<p:txBody><a:bodyPr wrap="{wrap}" lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="{anchor}">{fit}</a:bodyPr>'
        f'<a:lstStyle/>{body}</p:txBody></p:sp>'
    )


def para(runs, level=0, align=None, bullet=False, space_before=None, line_spacing=None,
         numbered=False, bullet_char="\u2022"):
    # Attributes must be collected before the open tag is emitted; appending
    # them after `>` makes them element text and the parser silently drops
    # `lvl`/`algn`, so indentation and justification never reach the renderer.
    attrs = ""
    if level:
        attrs += f' lvl="{level}"'
    if align:
        attrs += f' algn="{align}"'
    body = ""
    if space_before is not None:
        body += f'<a:spcBef><a:spcPts val="{space_before}"/></a:spcBef>'
    # `a:lnSpc` is emitted before the bullet so the ordering matches what Office
    # writes; a parser that reads children in order must not depend on it, but the
    # fixture should not be the thing that proves it.
    if line_spacing is not None:
        if isinstance(line_spacing, int) and line_spacing >= 1000:
            body += f'<a:lnSpc><a:spcPts val="{line_spacing}"/></a:lnSpc>'
        else:
            body += f'<a:lnSpc><a:spcPct val="{int(line_spacing * 1000)}"/></a:lnSpc>'
    if numbered:
        body += '<a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod"/>'
    elif bullet:
        body += f'<a:buChar char="{bullet_char}"/>'
    else:
        body += "<a:buNone/>"
    return f"<a:p><a:pPr{attrs}>{body}</a:pPr>{runs}</a:p>"


def run(text, size=None, bold=False, italic=False, color="1F2328", font=None, spc=None, cap=None):
    """`size=None` omits `sz` so the run inherits it from the placeholder chain."""
    props = '<a:rPr lang="en-US"'
    if size:
        props += f' sz="{size}"'
    if bold:
        props += ' b="1"'
    if italic:
        props += ' i="1"'
    if spc:
        props += f' spc="{spc}"'
    if cap:
        props += f' cap="{cap}"'
    props += f'><a:solidFill><a:srgbClr val="{color}"/></a:solidFill>'
    props += f'<a:latin typeface="{font or "+mn-lt"}"/></a:rPr>'
    return f"<a:r>{props}<a:t>{text}</a:t></a:r>"


SLIDE1 = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld name="Shapes">
<p:bg><p:bgPr><a:solidFill><a:schemeClr val="lt1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
{slide_ph(2, "Title", "title", 1, [para(run("Shape and text fidelity", bold=True, color="123A63", font="+mj-lt"))], anchor="ctr")}
{slide_ph(3, "Subtitle", "body", 2, [para(run("Exact EMU geometry, theme colours, resolved text insets", size="1600", color="4A5A6A"))])}
{rect_shape(4, "Blue card", emu(1.6), emu(4.6), emu(6.4), emu(2.6), scheme="accent1", text="Scheme colour fill", align="ctr", bold=True)}
{rect_shape(5, "Orange card", emu(8.4), emu(4.6), emu(6.4), emu(2.6), fill="ED7D31", text="RGB fill with stroke", line="833C00", align="ctr", bold=True)}
{rect_shape(6, "Rounded card", emu(15.2), emu(4.6), emu(6.4), emu(2.6), scheme="accent6", prst="roundRect", text="roundRect geometry", align="ctr", bold=True)}
{rect_shape(7, "Ellipse", emu(1.6), emu(7.8), emu(4.2), emu(2.6), scheme="accent4", prst="ellipse", text="ellipse", align="ctr", bold=True, size="1400")}
{rect_shape(8, "Triangle", emu(6.4), emu(7.8), emu(4.2), emu(2.6), scheme="accent2", prst="triangle", text="triangle", align="ctr", bold=True, size="1400")}
{slide_ph(12, "Mixed runs", "body", 3, [para(run("Bold red, ", bold=True, color="C0392B") + run("then plain blue.", color="1F4E9C"))])}
{slide_ph(9, "Bullets", "body", 3, [
    para(run("First bullet with a much longer body that has to wrap inside the text box bounds.", size="1400"), level=0, bullet=True, line_spacing=90),
    para(run("Second bullet", size="1400"), level=0, bullet=True, line_spacing=90),
    para(run("Indented sub-point", size="1200", color="57606A"), level=1, bullet=True, line_spacing=90),
    para(run("Third point at a fixed leading", size="1400"), level=0, numbered=True, line_spacing=2000),
    para(run("Justified paragraph to verify alignment distribution across the full line box.", size="1200"), align="just"),
])}
</p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>"""

CHART_FRAME = f"""<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="20" name="Chart 1"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
<p:xfrm><a:off x="{emu(2.0)}" y="{emu(1.4)}"/><a:ext cx="{emu(24)}" cy="{emu(12)}"/></p:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId2"/>
</a:graphicData></a:graphic></p:graphicFrame>"""

SLIDE2 = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld name="Chart">
<p:bg><p:bgPr><a:gradFill rotWithShape="1">
<a:gsLst><a:gs pos="0"><a:schemeClr val="lt1"/></a:gs><a:gs pos="100000"><a:schemeClr val="lt2"/></a:gs></a:gsLst>
<a:lin ang="5400000" scaled="0"/></a:gradFill><a:effectLst/></p:bgPr></p:bg>
<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
{txbox(2, "Chart title", emu(2.0), emu(0.5), emu(24), emu(1.0), [para(run("Clustered column chart with a gradient slide background", size="2000", bold=True, color="123A63"))], anchor="ctr")}
{CHART_FRAME}
</p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>"""

CATS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"]
SERIES = [("Series 1", [4.3, 2.4, 2.0, 5.5, 4.9, 6.5, 5.3, 7.8, 6.1]),
          ("Series 2", [2.0, 1.9, 1.7, 3.5, 3.1, 4.2, 3.6, 4.9, 4.1]),
          ("Series 3", [1.1, 0.9, 1.3, 2.4, 2.2, 2.9, 2.6, 3.5, 3.0])]


def cat_ref():
    pts = "".join(
        f'<c:pt idx="{i}"><c:v>{c}</c:v></c:pt>' for i, c in enumerate(CATS)
    )
    return (
        "<c:cat><c:strRef><c:f>Sheet1!$A$2:$A${len(CATS) + 1}</c:f>"
        f'<c:strCache><c:ptCount val="{len(CATS)}"/>{pts}</c:strCache></c:strRef></c:cat>'
    )


def series_xml(index, name, values):
    pts = "".join(f'<c:pt idx="{i}"><c:v>{v}</c:v></c:pt>' for i, v in enumerate(values))
    col = "accent1" if index == 0 else ("accent2" if index == 1 else "accent3")
    return (
        "<c:ser>"
        f'<c:idx val="{index}"/><c:order val="{index}"/>'
        f"<c:tx><c:strRef><c:f>Sheet1!${chr(66 + index)}$1</c:f>"
        f'<c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>{name}</c:v></c:pt></c:strCache></c:strRef></c:tx>'
        f'<c:spPr><a:solidFill><a:schemeClr val="{col}"/></a:solidFill>'
        '<a:ln><a:noFill/></a:ln></c:spPr>'
        '<c:invertIfNegative val="0"/>'
        f"{cat_ref()}"
        f"<c:val><c:numRef><c:f>Sheet1!${chr(66 + index)}$2:${chr(66 + index)}${len(CATS) + 1}</c:f>"
        f'<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="{len(values)}"/>{pts}</c:numCache></c:numRef></c:val>'
        "</c:ser>"
    )


CHART = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<c:chart>
<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="1400" b="1"/><a:t>Quarterly units by series</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
<c:autoTitleDeleted val="0"/>
<c:plotArea><c:layout/>
<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>
{"".join(series_xml(i, n, v) for i, (n, v) in enumerate(SERIES))}
<c:gapWidth val="80"/><c:overlap val="-15"/>
<c:axId val="111111111"/><c:axId val="222222222"/></c:barChart>
<c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>
<c:crossAx val="222222222"/></c:catAx>
<c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>
<c:majorGridlines/><c:crossAx val="111111111"/></c:valAx>
</c:plotArea>
<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>
<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>
</c:chart>
</c:chartSpace>"""

SLIDE3 = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld name="Table">
<p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
{txbox(2, "Title", emu(1.6), emu(0.7), emu(24), emu(1.4), [para(run("Pipeline stages", size="2800", bold=True, color="123A63"))], anchor="ctr")}
<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="30" name="Table 1"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
<p:xfrm><a:off x="{emu(2.0)}" y="{emu(2.6)}"/><a:ext cx="{emu(24)}" cy="{emu(9)}"/></p:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
<a:tbl><a:tblPr firstRow="1" bandRow="1"><a:tableStyleId>{{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}}</a:tableStyleId></a:tblPr>
<a:tblGrid><a:gridCol w="{emu(6)}"/><a:gridCol w="{emu(6)}"/><a:gridCol w="{emu(6)}"/><a:gridCol w="{emu(6)}"/></a:tblGrid>
<a:tr h="{emu(1.6)}">
{"".join(f'''<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="1400" b="1"/><a:t>{t}</a:t></a:r></a:p></a:txBody><a:tcPr marL="45720" marR="45720" marT="45720" marB="45720" anchor="ctr"/></a:tc>''' for t in ("Stage", "Input", "Output", "Status"))}
</a:tr>
{"".join(f'''<a:tr h="{emu(1.4)}">''' + "".join(f'''<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1300"/><a:t>{t}</a:t></a:r></a:p></a:txBody><a:tcPr marL="45720" marR="45720" marT="45720" marB="45720"/></a:tc>''' for t in row) + "</a:tr>" for row in (("Package", "bytes", "parts", "done"), ("Parse", "OPC", "model", "done"), ("Layout", "model", "boxes", "done"), ("Render", "boxes", "DOM", "done")))}
</a:tbl></a:graphicData></a:graphic></p:graphicFrame>
</p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>"""

SLIDE_RELS_NO_CHART = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>"""

SLIDE2_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>
</Relationships>"""

# A slide whose whole purpose is to make transform and compositing mistakes
# visible: a rescaled group (chOff/chExt differ from off/ext), a group nested
# inside it, a rotated shape, a cropped picture, an arrowed connector and two
# overlapping translucent shapes whose order decides the blended result.
GRAD_RECT = f"""<p:sp><p:nvSpPr><p:cNvPr id="40" name="Rotated gradient"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm rot="1800000"><a:off x="{emu(1.5)}" y="{emu(1.4)}"/><a:ext cx="{emu(6.0)}" cy="{emu(3.0)}"/></a:xfrm>
<a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom>
<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="FF8A00"/></a:gs><a:gs pos="100000"><a:srgbClr val="E02020"/></a:gs></a:gsLst><a:lin ang="2700000" scaled="0"/></a:gradFill>
<a:ln w="12700"><a:solidFill><a:srgbClr val="5A3200"/></a:solidFill></a:ln>
<a:effectLst><a:outerShdw blurRad="{emu(0.3)}" dist="{emu(0.12)}" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="45000"/></a:srgbClr></a:outerShdw></a:effectLst>
</p:spPr><p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="1600" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>rot 30deg + shadow</a:t></a:r></a:p></p:txBody></p:sp>"""

# A group whose child space is *larger* than its own box: children authored at
# 0,0..24x12 must be squeezed into 0,0..8x4. Getting this wrong scales the
# subtree 3x and pushes it off the slide.
INNER_GROUP = f"""<p:grpSp><p:nvGrpSpPr><p:cNvPr id="42" name="Inner group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="{emu(6.0)}" y="{emu(6.0)}"/><a:ext cx="{emu(6.0)}" cy="{emu(3.0)}"/>
<a:chOff x="{emu(2.0)}" y="{emu(2.0)}"/><a:chExt cx="{emu(12.0)}" cy="{emu(6.0)}"/></a:xfrm></p:grpSpPr>
<p:sp><p:nvSpPr><p:cNvPr id="43" name="Inner bar"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="{emu(2.0)}" y="{emu(2.0)}"/><a:ext cx="{emu(4.0)}" cy="{emu(6.0)}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="1F6FEB"/></a:solidFill></p:spPr>
<p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="1200" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>nested</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="44" name="Inner bar 2"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="{emu(6.0)}" y="{emu(2.0)}"/><a:ext cx="{emu(8.0)}" cy="{emu(6.0)}"/></a:xfrm>
<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="00A878"/></a:solidFill></p:spPr>
<p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="1200" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>scaled</a:t></a:r></a:p></p:txBody></p:sp>
</p:grpSp>"""

OUTER_GROUP = f"""<p:grpSp><p:nvGrpSpPr><p:cNvPr id="41" name="Outer group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="{emu(1.5)}" y="{emu(5.0)}"/><a:ext cx="{emu(8.0)}" cy="{emu(4.0)}"/>
<a:chOff x="{emu(0.0)}" y="{emu(0.0)}"/><a:chExt cx="{emu(24.0)}" cy="{emu(12.0)}"/></a:xfrm></p:grpSpPr>
<p:sp><p:nvSpPr><p:cNvPr id="45" name="Group base"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{emu(24.0)}" cy="{emu(12.0)}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="F2F4F7"/></a:solidFill>
<a:ln w="9525"><a:solidFill><a:srgbClr val="AFB4BC"/></a:solidFill></a:ln></p:spPr>
<p:txBody><a:bodyPr anchor="t"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1200"><a:solidFill><a:srgbClr val="57606A"/></a:solidFill></a:rPr><a:t>group chExt 24x12 -&gt; 8x4 cm</a:t></a:r></a:p></p:txBody></p:sp>
{INNER_GROUP}
</p:grpSp>"""

PICTURE = f"""<p:pic><p:nvPicPr><p:cNvPr id="46" name="Swatch"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>
<p:blipFill><a:blip r:embed="rId2"><a:alphaModFix amt="85000"/></a:blip><a:srcRect l="10000" t="5000" r="5000" b="10000"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
<p:spPr><a:xfrm flipH="1"><a:off x="{emu(10.5)}" y="{emu(1.4)}"/><a:ext cx="{emu(6.0)}" cy="{emu(4.0)}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="19050"><a:solidFill><a:srgbClr val="1F2328"/></a:solidFill></a:ln></p:spPr></p:pic>"""

# A picture with no `a:ln` at all. The bordered swatch above cannot catch a
# default stroke being invented for pictures, because it asks for one; this one
# must come out with no border.
PICTURE_PLAIN = f"""<p:pic><p:nvPicPr><p:cNvPr id="53" name="Plain swatch"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>
<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
<p:spPr><a:xfrm><a:off x="{emu(17.5)}" y="{emu(12.3)}"/><a:ext cx="{emu(3.0)}" cy="{emu(2.0)}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>"""

CONNECTOR = f"""<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="47" name="Arrow"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>
<p:spPr><a:xfrm flipV="1"><a:off x="{emu(10.5)}" y="{emu(6.0)}"/><a:ext cx="{emu(6.0)}" cy="{emu(2.4)}"/></a:xfrm>
<a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom>
<a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="C9252D"/></a:solidFill><a:prstDash val="dash"/><a:round/><a:headEnd type="none"/><a:tailEnd type="triangle" w="lg" len="lg"/></a:ln></p:spPr></p:cxnSp>"""

# Overlapping translucent shapes: only correct z-order produces the intended
# blend, so a renderer that reverses order produces a visibly different colour.
STACK_A = f"""<p:sp><p:nvSpPr><p:cNvPr id="48" name="Stack under"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="{emu(10.5)}" y="{emu(9.0)}"/><a:ext cx="{emu(5.0)}" cy="{emu(3.0)}"/></a:xfrm>
<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="1F6FEB"><a:alpha val="60000"/></a:srgbClr></a:solidFill></p:spPr></p:sp>"""
STACK_B = f"""<p:sp><p:nvSpPr><p:cNvPr id="49" name="Stack over"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="{emu(13.0)}" y="{emu(9.6)}"/><a:ext cx="{emu(5.0)}" cy="{emu(3.0)}"/></a:xfrm>
<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="F5A623"><a:alpha val="60000"/></a:srgbClr></a:solidFill></p:spPr></p:sp>"""

# A custom geometry written the way plenty of producers emit one: `a:path` with
# no `w`/`h`. The coordinates are in the path's own space, so a renderer that
# assumes the unit box without dividing by the path size draws this triangle
# thousands of times too large -- its stroke then escapes the shape box and
# crosses the slide. Both forms are here so the one that carries the guide
# dimensions keeps asserting the scaled result.
CUSTGEOM_NO_WH = f"""<p:sp><p:nvSpPr><p:cNvPr id="51" name="Custom geometry"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="{emu(17.5)}" y="{emu(4.2)}"/><a:ext cx="{emu(5.0)}" cy="{emu(3.0)}"/></a:xfrm>
<a:custGeom><a:avLst/><a:gdLst/><a:pathLst><a:path>
<a:moveTo><a:pt x="10800" y="0"/></a:moveTo>
<a:lnTo><a:pt x="21600" y="21600"/></a:lnTo>
<a:lnTo><a:pt x="0" y="21600"/></a:lnTo>
<a:close/></a:path></a:pathLst></a:custGeom>
<a:solidFill><a:srgbClr val="E8F0FE"/></a:solidFill>
<a:ln w="19050"><a:solidFill><a:srgbClr val="1F2328"/></a:solidFill></a:ln></p:spPr></p:sp>"""

CUSTGEOM_WITH_WH = f"""<p:sp><p:nvSpPr><p:cNvPr id="52" name="Custom geometry sized"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="{emu(17.5)}" y="{emu(7.4)}"/><a:ext cx="{emu(5.0)}" cy="{emu(3.0)}"/></a:xfrm>
<a:custGeom><a:avLst/><a:gdLst/><a:pathLst><a:path w="21600" h="21600">
<a:moveTo><a:pt x="10800" y="0"/></a:moveTo>
<a:lnTo><a:pt x="21600" y="21600"/></a:lnTo>
<a:lnTo><a:pt x="0" y="21600"/></a:lnTo>
<a:close/></a:path></a:pathLst></a:custGeom>
<a:solidFill><a:srgbClr val="FFF4E5"/></a:solidFill>
<a:ln w="19050"><a:solidFill><a:srgbClr val="1F2328"/></a:solidFill></a:ln></p:spPr></p:sp>"""

SLIDE4 = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld name="Compositing">
<p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
{txbox(2, "Title", emu(1.5), emu(0.4), emu(24), emu(1.0), [para(run("Transforms, groups, images and z-order", size="2000", bold=True, color="123A63"))], anchor="ctr")}
{GRAD_RECT}
{OUTER_GROUP}
{PICTURE}
{PICTURE_PLAIN}
{CONNECTOR}
{STACK_A}
{STACK_B}
{CUSTGEOM_NO_WH}
{CUSTGEOM_WITH_WH}
{txbox(50, "Legend", emu(17.5), emu(9.0), emu(8.0), emu(3.0), [para(run("Blue circle is authored first, so the amber one blends on top.", size="1200", color="57606A"))], anchor="t")}
</p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>"""

SLIDE4_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
</Relationships>"""

CORE = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>Office View Engine chart fixture</dc:title>
<dc:creator>preview-file</dc:creator>
<cp:lastModifiedBy>preview-file</cp:lastModifiedBy>
</cp:coreProperties>"""

APP = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>preview-file fixture builder</Application>
<Slides>4</Slides>
</Properties>"""


def main():
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "chart-deck.pptx")
    parts = {
        "[Content_Types].xml": CONTENT_TYPES,
        "_rels/.rels": ROOT_RELS,
        "ppt/presentation.xml": PRESENTATION,
        "ppt/_rels/presentation.xml.rels": PRESENTATION_RELS,
        "ppt/theme/theme1.xml": THEME,
        "ppt/slideMasters/slideMaster1.xml": SLIDE_MASTER,
        "ppt/slideMasters/_rels/slideMaster1.xml.rels": MASTER_RELS,
        "ppt/slideLayouts/slideLayout1.xml": SLIDE_LAYOUT,
        "ppt/slideLayouts/_rels/slideLayout1.xml.rels": SLIDE_LAYOUT_RELS,
        "ppt/slides/slide1.xml": SLIDE1,
        "ppt/slides/_rels/slide1.xml.rels": SLIDE_RELS_NO_CHART,
        "ppt/slides/slide2.xml": SLIDE2,
        "ppt/slides/_rels/slide2.xml.rels": SLIDE2_RELS,
        "ppt/slides/slide3.xml": SLIDE3,
        "ppt/slides/_rels/slide3.xml.rels": SLIDE_RELS_NO_CHART,
        "ppt/slides/slide4.xml": SLIDE4,
        "ppt/slides/_rels/slide4.xml.rels": SLIDE4_RELS,
        "ppt/charts/chart1.xml": CHART,
        "ppt/media/image1.png": png_bytes(96, 64, swatch),
        "docProps/core.xml": CORE,
        "docProps/app.xml": APP,
    }
    # A malformed part is the worst kind of fixture bug: the reader rejects it
    # and the slide under test silently renders as empty, so the deck "passes"
    # while testing nothing.
    for name, data in parts.items():
        if name.endswith((".xml", ".rels")):
            try:
                ElementTree.fromstring(data)
            except ElementTree.ParseError as error:
                raise SystemExit(f"{name} is not well-formed: {error}")

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in parts.items():
            zf.writestr(name, data)
    print(f"wrote {path} ({os.path.getsize(path)} bytes)")


if __name__ == "__main__":
    main()
