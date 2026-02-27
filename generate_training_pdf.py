#!/usr/bin/env python3
"""
ERP Training Document Generator
Systematic Cartography Design Philosophy
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, Color
from reportlab.pdfgen import canvas
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

# ─── FONT REGISTRATION ───
FONT_DIR = "/Users/adarshsingh/.claude/skills/canvas-design/canvas-fonts"

pdfmetrics.registerFont(TTFont('InstrumentSans', os.path.join(FONT_DIR, 'InstrumentSans-Regular.ttf')))
pdfmetrics.registerFont(TTFont('InstrumentSans-Bold', os.path.join(FONT_DIR, 'InstrumentSans-Bold.ttf')))
pdfmetrics.registerFont(TTFont('InstrumentSans-Italic', os.path.join(FONT_DIR, 'InstrumentSans-Italic.ttf')))
pdfmetrics.registerFont(TTFont('IBMPlexSerif', os.path.join(FONT_DIR, 'IBMPlexSerif-Regular.ttf')))
pdfmetrics.registerFont(TTFont('IBMPlexSerif-Bold', os.path.join(FONT_DIR, 'IBMPlexSerif-Bold.ttf')))
pdfmetrics.registerFont(TTFont('IBMPlexSerif-Italic', os.path.join(FONT_DIR, 'IBMPlexSerif-Italic.ttf')))
pdfmetrics.registerFont(TTFont('IBMPlexMono', os.path.join(FONT_DIR, 'IBMPlexMono-Regular.ttf')))
pdfmetrics.registerFont(TTFont('IBMPlexMono-Bold', os.path.join(FONT_DIR, 'IBMPlexMono-Bold.ttf')))
pdfmetrics.registerFont(TTFont('Jura-Light', os.path.join(FONT_DIR, 'Jura-Light.ttf')))
pdfmetrics.registerFont(TTFont('Jura-Medium', os.path.join(FONT_DIR, 'Jura-Medium.ttf')))
pdfmetrics.registerFont(TTFont('GeistMono', os.path.join(FONT_DIR, 'GeistMono-Regular.ttf')))
pdfmetrics.registerFont(TTFont('GeistMono-Bold', os.path.join(FONT_DIR, 'GeistMono-Bold.ttf')))
pdfmetrics.registerFont(TTFont('WorkSans', os.path.join(FONT_DIR, 'WorkSans-Regular.ttf')))
pdfmetrics.registerFont(TTFont('WorkSans-Bold', os.path.join(FONT_DIR, 'WorkSans-Bold.ttf')))
pdfmetrics.registerFont(TTFont('CrimsonPro', os.path.join(FONT_DIR, 'CrimsonPro-Regular.ttf')))
pdfmetrics.registerFont(TTFont('CrimsonPro-Bold', os.path.join(FONT_DIR, 'CrimsonPro-Bold.ttf')))
pdfmetrics.registerFont(TTFont('CrimsonPro-Italic', os.path.join(FONT_DIR, 'CrimsonPro-Italic.ttf')))

# ─── COLOR PALETTE ───
NAVY = HexColor('#1B2A4A')
NAVY_DARK = HexColor('#0F1B33')
NAVY_LIGHT = HexColor('#2D4470')
AMBER = HexColor('#D4920B')
AMBER_LIGHT = HexColor('#F0C75E')
AMBER_PALE = HexColor('#FDF3DC')
SLATE = HexColor('#64748B')
SLATE_LIGHT = HexColor('#94A3B8')
SLATE_PALE = HexColor('#F1F5F9')
WHITE = HexColor('#FFFFFF')
OFF_WHITE = HexColor('#FAFBFC')
WARM_GRAY = HexColor('#E8E4DF')
CHARCOAL = HexColor('#2D3748')
TEAL = HexColor('#0D7377')
TEAL_LIGHT = HexColor('#14B8A6')
ROSE = HexColor('#BE185D')
ROSE_LIGHT = HexColor('#F472B6')
GREEN = HexColor('#166534')
GREEN_LIGHT = HexColor('#22C55E')
BLUE_ACCENT = HexColor('#2563EB')
PURPLE = HexColor('#7C3AED')

# Domain colors
PURCHASE_COLOR = HexColor('#1E40AF')  # Deep blue
SALES_COLOR = HexColor('#B45309')     # Deep amber
INVENTORY_COLOR = HexColor('#047857') # Deep green
FINANCE_COLOR = HexColor('#6D28D9')   # Deep purple
MANUFACTURING_COLOR = HexColor('#BE185D')  # Deep rose

W, H = A4  # 595.27 x 841.89
MARGIN = 45
CONTENT_W = W - 2 * MARGIN

class ERPTrainingDoc:
    def __init__(self, filename):
        self.c = canvas.Canvas(filename, pagesize=A4)
        self.c.setTitle("ERP System - Complete Training Guide")
        self.c.setAuthor("System Documentation")
        self.page_num = 0
        self.y = H - MARGIN

    def save(self):
        self.c.save()

    # ─── DRAWING PRIMITIVES ───

    def draw_rect(self, x, y, w, h, fill=None, stroke=None, stroke_w=0.5, radius=0):
        self.c.saveState()
        if fill:
            self.c.setFillColor(fill)
        if stroke:
            self.c.setStrokeColor(stroke)
            self.c.setLineWidth(stroke_w)
        if radius > 0:
            self.c.roundRect(x, y, w, h, radius, fill=1 if fill else 0, stroke=1 if stroke else 0)
        else:
            self.c.rect(x, y, w, h, fill=1 if fill else 0, stroke=1 if stroke else 0)
        self.c.restoreState()

    def draw_line(self, x1, y1, x2, y2, color=SLATE_LIGHT, width=0.5):
        self.c.saveState()
        self.c.setStrokeColor(color)
        self.c.setLineWidth(width)
        self.c.line(x1, y1, x2, y2)
        self.c.restoreState()

    def draw_circle(self, x, y, r, fill=None, stroke=None, stroke_w=0.5):
        self.c.saveState()
        if fill:
            self.c.setFillColor(fill)
        if stroke:
            self.c.setStrokeColor(stroke)
            self.c.setLineWidth(stroke_w)
        self.c.circle(x, y, r, fill=1 if fill else 0, stroke=1 if stroke else 0)
        self.c.restoreState()

    def draw_arrow(self, x1, y1, x2, y2, color=SLATE, width=1):
        """Draw line with arrowhead"""
        self.c.saveState()
        self.c.setStrokeColor(color)
        self.c.setFillColor(color)
        self.c.setLineWidth(width)
        self.c.line(x1, y1, x2, y2)
        # Arrowhead
        import math
        angle = math.atan2(y2 - y1, x2 - x1)
        arrow_len = 6
        ax1 = x2 - arrow_len * math.cos(angle - 0.4)
        ay1 = y2 - arrow_len * math.sin(angle - 0.4)
        ax2 = x2 - arrow_len * math.cos(angle + 0.4)
        ay2 = y2 - arrow_len * math.sin(angle + 0.4)
        p = self.c.beginPath()
        p.moveTo(x2, y2)
        p.lineTo(ax1, ay1)
        p.lineTo(ax2, ay2)
        p.close()
        self.c.drawPath(p, fill=1, stroke=0)
        self.c.restoreState()

    def draw_arrow_down(self, x, y1, y2, color=SLATE, width=1):
        self.draw_arrow(x, y1, x, y2, color, width)

    def draw_text(self, text, x, y, font='IBMPlexSerif', size=10, color=CHARCOAL, align='left', max_width=None):
        self.c.saveState()
        self.c.setFont(font, size)
        self.c.setFillColor(color)
        if max_width:
            # Truncate text if too wide
            while self.c.stringWidth(text, font, size) > max_width and len(text) > 3:
                text = text[:-4] + '...'
        if align == 'center':
            self.c.drawCentredString(x, y, text)
        elif align == 'right':
            self.c.drawRightString(x, y, text)
        else:
            self.c.drawString(x, y, text)
        self.c.restoreState()

    def text_width(self, text, font='IBMPlexSerif', size=10):
        return pdfmetrics.stringWidth(text, font, size)

    def draw_wrapped_text(self, text, x, y, max_width, font='IBMPlexSerif', size=10, color=CHARCOAL, leading=14):
        """Draw text with word wrapping, return final y position"""
        self.c.saveState()
        self.c.setFont(font, size)
        self.c.setFillColor(color)
        words = text.split()
        lines = []
        current_line = ""
        for word in words:
            test = current_line + (" " if current_line else "") + word
            if self.c.stringWidth(test, font, size) <= max_width:
                current_line = test
            else:
                if current_line:
                    lines.append(current_line)
                current_line = word
        if current_line:
            lines.append(current_line)
        for line in lines:
            self.c.drawString(x, y, line)
            y -= leading
        self.c.restoreState()
        return y

    # ─── PAGE INFRASTRUCTURE ───

    def new_page(self, section_code=""):
        if self.page_num > 0:
            self.c.showPage()
        self.page_num += 1
        self.y = H - MARGIN
        self._draw_page_frame(section_code)

    def _draw_page_frame(self, section_code=""):
        """Draw consistent page frame with grid markers"""
        # Subtle border
        self.draw_rect(MARGIN - 10, MARGIN - 10, W - 2*(MARGIN-10), H - 2*(MARGIN-10),
                       stroke=HexColor('#E2E8F0'), stroke_w=0.3)

        # Top rule
        self.draw_line(MARGIN, H - 30, W - MARGIN, H - 30, NAVY, 0.8)
        self.draw_line(MARGIN, H - 31.5, W - MARGIN, H - 31.5, AMBER, 0.3)

        # Section code top-left
        if section_code:
            self.draw_text(section_code, MARGIN, H - 25, 'GeistMono', 7, SLATE_LIGHT)

        # Page number bottom-right
        self.draw_text(f'{self.page_num:02d}', W - MARGIN, MARGIN - 5,
                      'GeistMono', 7, SLATE_LIGHT, align='right')

        # Bottom rule
        self.draw_line(MARGIN, MARGIN + 5, W - MARGIN, MARGIN + 5, HexColor('#E2E8F0'), 0.3)

        # Corner marks
        mark_len = 6
        for cx, cy in [(MARGIN-10, H-MARGIN+10), (W-MARGIN+10, H-MARGIN+10),
                       (MARGIN-10, MARGIN-10), (W-MARGIN+10, MARGIN-10)]:
            pass  # Minimal corner marks for clean look

    def check_space(self, needed):
        """Check if enough space, start new page if not"""
        if self.y - needed < MARGIN + 20:
            return False
        return True

    # ─── SECTION HEADERS ───

    def draw_section_header(self, number, title, subtitle=""):
        """Major section header with rule"""
        self.y -= 5
        # Number
        self.draw_text(number, MARGIN, self.y, 'GeistMono', 9, AMBER)
        self.y -= 22
        # Title
        self.draw_text(title, MARGIN, self.y, 'InstrumentSans-Bold', 20, NAVY)
        self.y -= 8
        # Rule under title
        self.draw_line(MARGIN, self.y, MARGIN + 180, self.y, AMBER, 1.5)
        self.draw_line(MARGIN + 182, self.y, W - MARGIN, self.y, SLATE_LIGHT, 0.3)
        self.y -= 6
        if subtitle:
            self.y -= 10
            self.draw_text(subtitle, MARGIN, self.y, 'IBMPlexSerif-Italic', 9, SLATE)
            self.y -= 8
        self.y -= 12

    def draw_subsection(self, title, label=""):
        """Subsection header"""
        self.y -= 8
        if label:
            self.draw_text(label, MARGIN, self.y + 1, 'GeistMono', 7, AMBER)
        self.draw_text(title, MARGIN + (40 if label else 0), self.y, 'InstrumentSans-Bold', 13, NAVY_DARK)
        self.y -= 4
        self.draw_line(MARGIN, self.y, MARGIN + 120, self.y, AMBER, 0.6)
        self.y -= 14

    def draw_sub_subsection(self, title):
        """Sub-subsection header"""
        self.y -= 6
        self.draw_text(title, MARGIN, self.y, 'WorkSans-Bold', 10.5, NAVY)
        self.y -= 14

    # ─── CONTENT ELEMENTS ───

    def draw_paragraph(self, text, indent=0):
        """Draw a paragraph of body text"""
        self.y = self.draw_wrapped_text(
            text, MARGIN + indent, self.y, CONTENT_W - indent,
            'CrimsonPro', 10.5, CHARCOAL, 15
        )
        self.y -= 4

    def draw_bullet(self, text, indent=15, bullet_char="\u2022"):
        """Draw a bullet point"""
        self.draw_text(bullet_char, MARGIN + indent - 10, self.y, 'CrimsonPro', 10, SLATE)
        self.y = self.draw_wrapped_text(
            text, MARGIN + indent + 2, self.y, CONTENT_W - indent - 2,
            'CrimsonPro', 10, CHARCOAL, 14
        )
        self.y -= 3

    def draw_numbered_item(self, num, text, indent=15):
        """Draw numbered list item"""
        self.draw_text(f"{num}.", MARGIN + indent - 12, self.y, 'GeistMono', 8.5, AMBER)
        self.y = self.draw_wrapped_text(
            text, MARGIN + indent + 4, self.y, CONTENT_W - indent - 4,
            'CrimsonPro', 10, CHARCOAL, 14
        )
        self.y -= 3

    def draw_code_text(self, text, indent=15):
        """Draw monospaced text"""
        self.draw_text(text, MARGIN + indent, self.y, 'GeistMono', 8, NAVY_LIGHT)
        self.y -= 12

    def draw_note_box(self, title, text, color=AMBER):
        """Draw a highlighted note box"""
        box_h = 40
        self.draw_rect(MARGIN, self.y - box_h, CONTENT_W, box_h,
                       fill=HexColor('#FFFBEB'), stroke=color, stroke_w=0.5, radius=3)
        self.draw_rect(MARGIN, self.y - box_h, 3, box_h, fill=color, radius=1)
        self.draw_text(title, MARGIN + 12, self.y - 14, 'InstrumentSans-Bold', 9, color)
        self.y = self.draw_wrapped_text(text, MARGIN + 12, self.y - 28, CONTENT_W - 24,
                                        'CrimsonPro', 9, CHARCOAL, 12)
        self.y -= 10

    def draw_info_box(self, title, text):
        """Draw info box with blue accent"""
        lines = text.split('\n')
        box_h = 18 + len(lines) * 13
        self.draw_rect(MARGIN, self.y - box_h, CONTENT_W, box_h,
                       fill=HexColor('#EFF6FF'), stroke=BLUE_ACCENT, stroke_w=0.4, radius=3)
        self.draw_rect(MARGIN, self.y - box_h, 3, box_h, fill=BLUE_ACCENT, radius=1)
        self.draw_text(title, MARGIN + 12, self.y - 13, 'InstrumentSans-Bold', 9, BLUE_ACCENT)
        ty = self.y - 27
        for line in lines:
            self.draw_text(line, MARGIN + 12, ty, 'CrimsonPro', 9, CHARCOAL)
            ty -= 13
        self.y -= box_h + 8

    # ─── FLOW DIAGRAM ELEMENTS ───

    def draw_flow_node(self, x, y, w, h, text, fill=NAVY, text_color=WHITE, font_size=8):
        """Draw a rounded rectangle node"""
        self.draw_rect(x, y, w, h, fill=fill, radius=4)
        # Center text
        lines = text.split('\n')
        ty = y + h/2 + (len(lines)-1) * 5
        for line in lines:
            self.draw_text(line, x + w/2, ty, 'InstrumentSans-Bold', font_size, text_color, align='center')
            ty -= 12

    def draw_status_node(self, x, y, text, fill=SLATE_PALE, text_color=CHARCOAL, w=None):
        """Draw a status pill"""
        if w is None:
            w = self.text_width(text, 'GeistMono', 7) + 14
        h = 18
        self.draw_rect(x, y, w, h, fill=fill, radius=9)
        self.draw_text(text, x + w/2, y + 5, 'GeistMono', 7, text_color, align='center')
        return w

    def draw_flow_arrow_right(self, x1, y, x2, color=SLATE):
        """Horizontal arrow"""
        self.draw_arrow(x1, y, x2, y, color, 0.8)

    # ─── TABLE ELEMENTS ───

    def draw_table_header(self, cols, x=None, widths=None):
        """Draw table header row. cols = list of (text, width)"""
        if x is None:
            x = MARGIN
        h = 20
        self.draw_rect(x, self.y - h, CONTENT_W, h, fill=NAVY)
        cx = x + 8
        for i, (text, w) in enumerate(cols):
            self.draw_text(text, cx, self.y - 14, 'InstrumentSans-Bold', 8, WHITE)
            cx += w
        self.y -= h

    def draw_table_row(self, values, cols, x=None, alt=False):
        """Draw table data row"""
        if x is None:
            x = MARGIN
        h = 18
        if alt:
            self.draw_rect(x, self.y - h, CONTENT_W, h, fill=SLATE_PALE)
        cx = x + 8
        for i, (val, (_, w)) in enumerate(zip(values, cols)):
            font = 'GeistMono' if i == 0 else 'CrimsonPro'
            size = 7.5 if i == 0 else 9
            self.draw_text(str(val), cx, self.y - 12, font, size, CHARCOAL, max_width=w-12)
            cx += w
        self.y -= h

    # ═══════════════════════════════════════════════════
    # PAGE GENERATORS
    # ═══════════════════════════════════════════════════

    def page_cover(self):
        """Cover page"""
        self.c.setPageSize(A4)
        self.page_num += 1

        # Full navy background
        self.draw_rect(0, 0, W, H, fill=NAVY_DARK)

        # Geometric pattern - grid of thin lines
        self.c.saveState()
        self.c.setStrokeColor(HexColor('#263B6A'))
        self.c.setLineWidth(0.2)
        for i in range(0, int(W), 20):
            self.c.line(i, 0, i, H)
        for i in range(0, int(H), 20):
            self.c.line(0, i, W, i)
        self.c.restoreState()

        # Accent circles (subtle)
        self.draw_circle(W * 0.8, H * 0.75, 120, fill=HexColor('#1E3A6E'))
        self.draw_circle(W * 0.15, H * 0.25, 80, fill=HexColor('#1E3A6E'))

        # Amber accent bar
        self.draw_rect(MARGIN + 5, H * 0.62, 60, 3, fill=AMBER)

        # Title block
        self.draw_text("ERP SYSTEM", MARGIN + 5, H * 0.58, 'Jura-Light', 14, SLATE_LIGHT)
        self.draw_text("Complete", MARGIN + 5, H * 0.50, 'InstrumentSans-Bold', 42, WHITE)
        self.draw_text("Training Guide", MARGIN + 5, H * 0.44, 'InstrumentSans-Bold', 42, WHITE)

        # Subtitle
        self.draw_text("Manufacturing ERP  |  Inventory  |  Sales  |  Purchase  |  Finance",
                       MARGIN + 5, H * 0.38, 'CrimsonPro-Italic', 11, AMBER_LIGHT)

        # Thin rule
        self.draw_line(MARGIN + 5, H * 0.36, W * 0.7, H * 0.36, AMBER, 0.5)

        # Description block
        self.draw_wrapped_text(
            "A comprehensive reference for understanding every module, workflow, and process "
            "in the Manufacturing ERP system. From initial setup through daily operations to "
            "financial reporting.",
            MARGIN + 5, H * 0.33, W * 0.55,
            'CrimsonPro', 10, SLATE_LIGHT, 15
        )

        # Bottom metadata
        self.draw_line(MARGIN + 5, H * 0.08, W - MARGIN, H * 0.08, HexColor('#263B6A'), 0.3)
        self.draw_text("DOCUMENT REF", MARGIN + 5, H * 0.06, 'GeistMono', 7, SLATE)
        self.draw_text("ERP-TRN-001", MARGIN + 5, H * 0.045, 'GeistMono', 8, AMBER_LIGHT)
        self.draw_text("VERSION", W * 0.35, H * 0.06, 'GeistMono', 7, SLATE)
        self.draw_text("1.0", W * 0.35, H * 0.045, 'GeistMono', 8, AMBER_LIGHT)
        self.draw_text("CLASSIFICATION", W * 0.55, H * 0.06, 'GeistMono', 7, SLATE)
        self.draw_text("INTERNAL TRAINING", W * 0.55, H * 0.045, 'GeistMono', 8, AMBER_LIGHT)

        self.c.showPage()

    def page_toc(self):
        """Table of Contents"""
        self.new_page("TOC")
        self.draw_section_header("00", "Table of Contents")

        toc_items = [
            ("01", "System Overview & Architecture", "Technology stack, multi-tenancy, authentication"),
            ("02", "Initial Setup & Configuration", "Company, branches, fiscal year, warehouses, chart of accounts"),
            ("03", "Master Data Management", "Customers, vendors, items, products, BOM, UOM, categories"),
            ("04", "Purchase Cycle", "Requisition, purchase order, GRN, vendor bill, vendor payment"),
            ("05", "Sales Cycle", "Quotation, sales order, delivery challan, invoice, payment receipt"),
            ("06", "Inventory Management", "Stock ledger, transfers, adjustments, batches, valuation"),
            ("07", "Manufacturing & Production", "Work orders, material issue, production entries, scrap"),
            ("08", "Accounting & Finance", "Chart of accounts, vouchers, ledger, trial balance, P&L, balance sheet"),
            ("09", "GST & Tax Compliance", "CGST, SGST, IGST, reverse charge, TDS/TCS, place of supply"),
            ("10", "Bank & Cash Management", "Bank accounts, reconciliation, payment modes"),
            ("11", "Reports & Analytics", "Inventory, sales, purchase, aging reports"),
            ("12", "Stock Impact Reference", "When stock increases, decreases, and gets reserved"),
            ("13", "Document Numbering & Sequences", "Auto-numbering, prefixes, financial year reset"),
            ("14", "Quick Reference Cheat Sheet", "Status flows, API endpoints, common operations"),
        ]

        for num, title, desc in toc_items:
            # Number
            self.draw_text(num, MARGIN + 5, self.y, 'GeistMono', 10, AMBER)
            # Title
            self.draw_text(title, MARGIN + 35, self.y, 'InstrumentSans-Bold', 11, NAVY)
            # Dots
            title_end = MARGIN + 35 + self.text_width(title, 'InstrumentSans-Bold', 11) + 8
            dots_end = W - MARGIN - 25
            if title_end < dots_end:
                dot_x = title_end
                while dot_x < dots_end:
                    self.draw_text('.', dot_x, self.y, 'CrimsonPro', 8, SLATE_LIGHT)
                    dot_x += 4
            # Page hint
            self.draw_text(num, W - MARGIN - 5, self.y, 'GeistMono', 9, SLATE, align='right')
            self.y -= 14
            # Description
            self.draw_text(desc, MARGIN + 35, self.y, 'CrimsonPro-Italic', 8.5, SLATE)
            self.y -= 20

    def page_system_overview(self):
        """Section 01: System Overview"""
        self.new_page("SEC-01")
        self.draw_section_header("01", "System Overview & Architecture",
                                "Understanding the foundation of the ERP system")

        self.draw_sub_subsection("Technology Stack")

        stack_items = [
            ("Backend", "Fastify (TypeScript) - High-performance Node.js web framework"),
            ("Database", "PostgreSQL - Relational database with ACID compliance"),
            ("ORM / Query", "Knex.js - SQL query builder with migration support"),
            ("Authentication", "JWT (JSON Web Tokens) - Stateless session management"),
            ("Architecture", "Service-based pattern with multi-tenant isolation"),
        ]
        for label, desc in stack_items:
            self.draw_text(label, MARGIN + 5, self.y, 'InstrumentSans-Bold', 9, NAVY)
            self.draw_text(desc, MARGIN + 90, self.y, 'CrimsonPro', 9.5, CHARCOAL)
            self.y -= 16

        self.y -= 10
        self.draw_sub_subsection("Multi-Tenant Architecture")
        self.draw_paragraph(
            "The system supports multiple companies within a single deployment. Every record in the "
            "database is scoped to a company_id, ensuring complete data isolation between tenants. "
            "Users can belong to multiple companies and switch between them after authentication."
        )

        self.y -= 6
        self.draw_sub_subsection("Authentication Flow")

        # Auth flow diagram
        nodes = [
            (MARGIN + 10, self.y - 25, 90, 22, "User Login\nCredentials"),
            (MARGIN + 130, self.y - 25, 90, 22, "Verify\nCredentials"),
            (MARGIN + 250, self.y - 25, 90, 22, "Generate\nJWT Token"),
            (MARGIN + 370, self.y - 25, 100, 22, "Token includes:\nuserId, companyId"),
        ]
        for x, y, w, h, text in nodes:
            self.draw_flow_node(x, y, w, h, text, NAVY, WHITE, 7)

        # Arrows between nodes
        self.draw_flow_arrow_right(MARGIN + 100, self.y - 14, MARGIN + 128, AMBER)
        self.draw_flow_arrow_right(MARGIN + 220, self.y - 14, MARGIN + 248, AMBER)
        self.draw_flow_arrow_right(MARGIN + 340, self.y - 14, MARGIN + 368, AMBER)

        self.y -= 55

        self.draw_paragraph(
            "Every subsequent API request must include the JWT token in the Authorization header. "
            "The token carries userId, companyId, branchId, and role information. All database "
            "queries are automatically scoped to the authenticated company."
        )

        self.y -= 6
        self.draw_sub_subsection("Core Modules Overview")

        modules = [
            ("Masters", "Customers, Vendors, Items, Products, BOM, UOM, Categories", NAVY),
            ("Purchase", "Requisitions, Purchase Orders, GRN, Vendor Bills, Vendor Payments", PURCHASE_COLOR),
            ("Sales", "Quotations, Sales Orders, Delivery Challans, Invoices, Payment Receipts", SALES_COLOR),
            ("Inventory", "Stock Ledger, Transfers, Adjustments, Batches, Valuation", INVENTORY_COLOR),
            ("Manufacturing", "Work Orders, Material Issue, Production Entries, Scrap", MANUFACTURING_COLOR),
            ("Finance", "Chart of Accounts, Vouchers, Ledger, Financial Statements", FINANCE_COLOR),
        ]

        for name, desc, color in modules:
            self.draw_rect(MARGIN, self.y - 22, 4, 22, fill=color)
            self.draw_rect(MARGIN + 4, self.y - 22, CONTENT_W - 4, 22, fill=SLATE_PALE, radius=2)
            self.draw_text(name, MARGIN + 14, self.y - 15, 'InstrumentSans-Bold', 9.5, color)
            self.draw_text(desc, MARGIN + 100, self.y - 15, 'CrimsonPro', 9, CHARCOAL)
            self.y -= 27

        self.y -= 8
        self.draw_sub_subsection("Soft Deletes & Versioning")
        self.draw_paragraph(
            "All master records use soft delete (is_deleted flag) rather than permanent deletion. "
            "Queries automatically filter to is_deleted=false. Every table includes a version counter "
            "and tracks created_at/updated_at timestamps. Sync status tracking (pending/synced/conflict) "
            "enables multi-device support with device-specific tracking."
        )

    def page_initial_setup(self):
        """Section 02: Initial Setup"""
        self.new_page("SEC-02")
        self.draw_section_header("02", "Initial Setup & Configuration",
                                "The first-time setup sequence - follow these steps in order")

        self.draw_info_box("IMPORTANT: Setup Order",
            "These steps must be completed in sequence before the system is operational.\n"
            "Each step builds on the previous one. Skipping steps will cause errors.")

        steps = [
            ("Company Setup", "POST /api/setup",
             "Create the first company with: name, address, GSTIN, PAN, base currency (INR), "
             "financial year start month (April = 4). This is the only endpoint that works "
             "without authentication. It also creates the first admin user."),
            ("Create Branches", "POST (via company config)",
             "Add branch locations with state/address information. The branch state is critical "
             "for GST calculation - it determines whether a transaction is intra-state (CGST+SGST) "
             "or inter-state (IGST). At least one branch is required."),
            ("Set Financial Year", "Auto-created on setup",
             "Financial year is created automatically based on the start month configured during "
             "company setup. Typical Indian FY: April 1 to March 31. The FY can be locked to "
             "prevent backdated entries. Year code format: 2024-25."),
            ("Create Warehouses", "POST /api/warehouses",
             "Define physical storage locations. Each warehouse can be assigned to a branch. "
             "You need at least one warehouse for receiving goods (purchase) and one for "
             "dispatching goods (sales). Manufacturing requires source and target warehouses."),
            ("Seed Chart of Accounts", "POST /api/finance/accounts/seed",
             "This seeds the standard chart of accounts with account types: Asset (current, fixed, "
             "bank, cash, receivable, inventory), Liability (payable, duty_tax, loan), Equity "
             "(capital, reserve), Revenue (income), Expense (COGS, direct, indirect)."),
            ("Create Bank Accounts", "POST /api/finance/bank-accounts",
             "Add bank accounts with: bank name, account number, IFSC code, branch, account type "
             "(current/savings). These are used for payment receipts, vendor payments, and bank "
             "reconciliation. Link each bank account to a ledger account in COA."),
            ("Setup UOM (Units)", "POST /api/masters/uom",
             "Create units of measurement: Nos (numbers), Kg, Ltr, Mtr, Box, etc. "
             "UOM conversion rates are stored for automatic conversion between units. "
             "Every item and product requires a UOM."),
            ("Setup Categories", "POST /api/masters/categories",
             "Create item/product categories for organization: Raw Materials, Components, "
             "Finished Goods, Packaging, etc. Categories help in filtering and reporting."),
            ("Setup Doc Sequences", "Configuration",
             "Configure document number sequences with prefixes: SQ- (quotation), SO- (sales order), "
             "INV- (invoice), PR- (requisition), PO- (purchase order), GRN- (goods receipt), "
             "WO- (work order). Numbers auto-increment per financial year."),
        ]

        for i, (title, endpoint, desc) in enumerate(steps):
            if not self.check_space(70):
                self.new_page("SEC-02")

            step_num = i + 1
            # Step number circle
            self.draw_circle(MARGIN + 12, self.y - 6, 10, fill=AMBER)
            self.draw_text(str(step_num), MARGIN + 12, self.y - 10, 'InstrumentSans-Bold', 9, WHITE, align='center')

            # Title and endpoint
            self.draw_text(title, MARGIN + 30, self.y, 'InstrumentSans-Bold', 11, NAVY)
            self.draw_text(endpoint, MARGIN + 30, self.y - 14, 'GeistMono', 7.5, TEAL)

            # Description
            self.y -= 30
            self.y = self.draw_wrapped_text(desc, MARGIN + 30, self.y, CONTENT_W - 35,
                                           'CrimsonPro', 9.5, CHARCOAL, 13)

            # Connector line to next step
            if i < len(steps) - 1:
                self.y -= 4
                self.draw_line(MARGIN + 12, self.y + 2, MARGIN + 12, self.y - 8, AMBER_LIGHT, 0.5)
                self.y -= 10

    def page_master_data(self):
        """Section 03: Master Data"""
        self.new_page("SEC-03")
        self.draw_section_header("03", "Master Data Management",
                                "Setting up the foundational entities of the system")

        # ─── CUSTOMERS ───
        self.draw_subsection("Customers", "03.1")
        self.draw_paragraph(
            "Customers represent the parties you sell to. Each customer has a unique code "
            "(auto-generated via next-code endpoint), name, GSTIN, PAN, and contact information. "
            "The customer state determines GST treatment on sales transactions."
        )

        self.draw_sub_subsection("Customer Fields")
        fields = [
            ("customer_code", "Auto-generated unique code (e.g., CUST-0001)"),
            ("name / trade_name", "Legal name and trade name"),
            ("gstin / pan", "Tax identification numbers"),
            ("customer_type", "Type classification"),
            ("credit_limit", "Maximum outstanding amount allowed"),
            ("payment_terms", "Default payment terms in days"),
            ("is_active", "Active/inactive status toggle"),
        ]
        for field, desc in fields:
            self.draw_text(field, MARGIN + 10, self.y, 'GeistMono', 8, TEAL)
            self.draw_text(desc, MARGIN + 160, self.y, 'CrimsonPro', 9.5, CHARCOAL)
            self.y -= 15

        self.y -= 6
        self.draw_sub_subsection("Contact Persons & Addresses")
        self.draw_paragraph(
            "Each customer can have multiple contact persons (name, email, phone, designation, "
            "is_primary flag) and multiple addresses (billing, shipping). Addresses use a polymorphic "
            "design (entity_type='customer') and include full address fields plus state and pincode. "
            "The shipping address state is critical for GST place-of-supply determination."
        )

        # ─── VENDORS ───
        self.y -= 6
        self.draw_subsection("Vendors", "03.2")
        self.draw_paragraph(
            "Vendors (suppliers) are parties you purchase from. Similar structure to customers but "
            "with additional vendor-specific features like vendor-item mapping and preferred vendor tracking."
        )

        self.draw_sub_subsection("Vendor-Item Mapping")
        self.draw_paragraph(
            "You can map specific items to vendors with pricing information. This creates a catalog "
            "of what each vendor supplies, at what price, with lead time information. When creating "
            "purchase orders, the system can suggest vendors based on these mappings."
        )
        self.draw_bullet("Maps vendor to specific items with vendor-specific pricing")
        self.draw_bullet("Tracks lead time per vendor per item")
        self.draw_bullet("Used for vendor suggestion during purchase order creation")
        self.draw_bullet("Supports multiple vendors per item for comparison")

        # ─── ITEMS ───
        if not self.check_space(180):
            self.new_page("SEC-03")
        self.y -= 6
        self.draw_subsection("Items (Raw Materials & Components)", "03.3")
        self.draw_paragraph(
            "Items represent raw materials, components, and consumables that are purchased from vendors "
            "and consumed in manufacturing. Items are SEPARATE from Products - items are what you buy, "
            "products are what you sell."
        )

        item_fields = [
            ("item_code", "Unique item identifier"),
            ("name / description", "Item name and detailed description"),
            ("category_id", "Links to item category"),
            ("uom_id", "Primary unit of measurement"),
            ("hsn_code", "HSN/SAC code for GST classification"),
            ("gst_rate", "Applicable GST rate (5%, 12%, 18%, 28%)"),
            ("min_stock_level", "Minimum stock for reorder alerts"),
            ("max_stock_level", "Maximum stock level"),
            ("reorder_point", "Stock level that triggers reorder"),
            ("lead_time_days", "Expected procurement lead time"),
        ]
        for field, desc in item_fields:
            if not self.check_space(16):
                self.new_page("SEC-03")
            self.draw_text(field, MARGIN + 10, self.y, 'GeistMono', 8, TEAL)
            self.draw_text(desc, MARGIN + 160, self.y, 'CrimsonPro', 9.5, CHARCOAL)
            self.y -= 15

        self.draw_note_box("KEY DISTINCTION",
            "Items and Products are separate entities. Items = raw materials you purchase. Products = finished goods you sell. Products do NOT have an item_id.")

        # ─── PRODUCTS ───
        if not self.check_space(120):
            self.new_page("SEC-03")
        self.y -= 4
        self.draw_subsection("Products (Finished Goods)", "03.4")
        self.draw_paragraph(
            "Products are finished goods that are manufactured (via work orders) and sold to customers. "
            "Each product can have a Bill of Materials (BOM) that defines the items and quantities "
            "needed to manufacture it."
        )
        self.draw_bullet("product_code - Unique product identifier")
        self.draw_bullet("name / description - Product name and detailed description")
        self.draw_bullet("category_id - Product category")
        self.draw_bullet("uom_id - Selling unit of measurement")
        self.draw_bullet("hsn_code - HSN code for GST on sales")
        self.draw_bullet("gst_rate - GST rate applicable on sales")
        self.draw_bullet("selling_price - Default selling price")
        self.draw_bullet("is_active - Active/inactive status")

        # ─── BOM ───
        if not self.check_space(160):
            self.new_page("SEC-03")
        self.y -= 6
        self.draw_subsection("Bill of Materials (BOM)", "03.5")
        self.draw_paragraph(
            "A BOM defines the recipe for manufacturing a product. It specifies which items (raw materials) "
            "are needed, in what quantities, to produce one unit of the finished product. BOMs require "
            "approval before they can be used in work orders."
        )

        self.draw_sub_subsection("BOM Structure")
        self.draw_bullet("BOM Header: Links to a product, has version number, status (draft/approved)")
        self.draw_bullet("BOM Lines: Each line specifies an item_id, quantity required per unit, UOM, and wastage %")
        self.draw_bullet("Approval: BOM must be approved before work orders can reference it")
        self.draw_bullet("Copy: Approved BOMs can be cloned to create new versions")
        self.draw_bullet("Multiple BOMs per product are supported (different versions/recipes)")

        # ─── UOM & CATEGORIES ───
        if not self.check_space(100):
            self.new_page("SEC-03")
        self.y -= 6
        self.draw_subsection("Units of Measurement & Categories", "03.6")
        self.draw_paragraph(
            "UOM (Units of Measurement) define how items and products are measured - Nos, Kg, Ltr, Mtr, "
            "Box, Pair, etc. Conversion rates between UOMs enable automatic unit conversion. Categories "
            "organize items and products into logical groups for filtering and reporting."
        )

    def page_purchase_cycle(self):
        """Section 04: Purchase Cycle"""
        self.new_page("SEC-04")
        self.draw_section_header("04", "Purchase Cycle",
                                "Complete procure-to-pay workflow")

        # Flow diagram
        flow_nodes = [
            ("Purchase\nRequisition", PURCHASE_COLOR),
            ("Purchase\nOrder", PURCHASE_COLOR),
            ("Goods Receipt\nNote (GRN)", INVENTORY_COLOR),
            ("Vendor\nBill", FINANCE_COLOR),
            ("Vendor\nPayment", FINANCE_COLOR),
        ]

        node_w = 85
        node_h = 30
        gap = 14
        start_x = MARGIN + 8
        node_y = self.y - 35

        for i, (text, color) in enumerate(flow_nodes):
            x = start_x + i * (node_w + gap)
            self.draw_flow_node(x, node_y, node_w, node_h, text, color, WHITE, 7.5)
            if i < len(flow_nodes) - 1:
                self.draw_flow_arrow_right(x + node_w + 2, node_y + node_h/2,
                                          x + node_w + gap - 2, AMBER)

        self.y = node_y - 15

        # Labels under nodes
        labels = ["Indent", "Order", "Receive", "Invoice", "Pay"]
        for i, label in enumerate(labels):
            x = start_x + i * (node_w + gap) + node_w/2
            self.draw_text(label, x, self.y, 'GeistMono', 7, SLATE, align='center')

        self.y -= 20

        # ─── PURCHASE REQUISITION ───
        self.draw_subsection("Purchase Requisition", "04.1")

        self.draw_sub_subsection("What is it?")
        self.draw_paragraph(
            "A purchase requisition is an internal request to procure items. It goes through an approval "
            "workflow (draft -> submitted -> approved) before it can be converted to a purchase order. "
            "This ensures proper authorization before any procurement commitment is made."
        )

        self.draw_sub_subsection("Status Flow")
        statuses = [
            ("Draft", SLATE_PALE, CHARCOAL),
            ("Submitted", HexColor('#DBEAFE'), PURCHASE_COLOR),
            ("Approved", HexColor('#D1FAE5'), GREEN),
            ("Rejected", HexColor('#FEE2E2'), ROSE),
            ("Converted", HexColor('#F3E8FF'), PURPLE),
        ]
        sx = MARGIN + 10
        for i, (status, bg, fg) in enumerate(statuses):
            w = self.draw_status_node(sx, self.y - 20, status, bg, fg)
            if i < len(statuses) - 1:
                self.draw_flow_arrow_right(sx + w + 3, self.y - 11, sx + w + 18, SLATE_LIGHT)
                sx += w + 22
            else:
                sx += w + 8
        self.y -= 38

        self.draw_sub_subsection("Key Fields")
        self.draw_bullet("requisition_number - Auto-generated (prefix PR-)")
        self.draw_bullet("requisition_date - Date of requisition")
        self.draw_bullet("required_date - Expected delivery date")
        self.draw_bullet("Lines: item_id, quantity, uom_id, estimated_rate, preferred vendor")
        self.draw_bullet("Approval: requires submission then approval by authorized user")

        self.draw_sub_subsection("Conversion to Purchase Order")
        self.draw_paragraph(
            "Only approved requisitions can be converted to purchase orders. The conversion copies all "
            "line items with their quantities and estimated rates. The requisition status changes to "
            "'converted' and the new PO links back to the requisition for traceability."
        )

        # ─── PURCHASE ORDER ───
        if not self.check_space(200):
            self.new_page("SEC-04")
        self.y -= 8
        self.draw_subsection("Purchase Order (PO)", "04.2")

        self.draw_sub_subsection("What is it?")
        self.draw_paragraph(
            "A purchase order is a formal document sent to a vendor authorizing the purchase of items "
            "at agreed prices. POs can be created standalone or from an approved requisition. Each PO "
            "line tracks ordered, received, and billed quantities for complete lifecycle tracking."
        )

        self.draw_sub_subsection("Status Flow")
        po_statuses = [
            ("Draft", SLATE_PALE, CHARCOAL),
            ("Approved", HexColor('#D1FAE5'), GREEN),
            ("Sent", HexColor('#DBEAFE'), PURCHASE_COLOR),
            ("Closed", HexColor('#F3F4F6'), SLATE),
            ("Cancelled", HexColor('#FEE2E2'), ROSE),
        ]
        sx = MARGIN + 10
        for i, (status, bg, fg) in enumerate(po_statuses):
            w = self.draw_status_node(sx, self.y - 20, status, bg, fg)
            if i < len(po_statuses) - 1 and i < 2:
                self.draw_flow_arrow_right(sx + w + 3, self.y - 11, sx + w + 18, SLATE_LIGHT)
                sx += w + 22
            else:
                sx += w + 8
        self.y -= 38

        self.draw_sub_subsection("PO Line Tracking")
        self.draw_paragraph(
            "Each PO line maintains running counters for quantity management:"
        )
        self.draw_bullet("ordered_quantity - Original quantity ordered from vendor")
        self.draw_bullet("received_quantity - Quantity received via GRN (updated on GRN confirmation)")
        self.draw_bullet("billed_quantity - Quantity invoiced via vendor bill")
        self.draw_bullet("Partial receiving is supported - multiple GRNs against one PO")

        self.draw_sub_subsection("GST on Purchase Orders")
        self.draw_paragraph(
            "GST is calculated by comparing the vendor's state with the company branch state. "
            "If both are in the same state: intra-state GST (CGST + SGST). If different states: "
            "inter-state GST (IGST). The vendor's address is looked up from the polymorphic "
            "addresses table (entity_type='vendor'). Each line must have an item_id for GST "
            "resolution via the resolveGst method."
        )

        # ─── GRN ───
        if not self.check_space(200):
            self.new_page("SEC-04")
        self.y -= 8
        self.draw_subsection("Goods Receipt Note (GRN)", "04.3")

        self.draw_sub_subsection("What is it?")
        self.draw_paragraph(
            "A GRN documents the physical receipt of goods at the warehouse. It records what was "
            "received, inspected, accepted, and rejected. GRN confirmation is the trigger point "
            "for adding stock to inventory - this is when stock physically enters the system."
        )

        self.draw_note_box("STOCK IMPACT",
            "GRN CONFIRMATION adds stock to inventory. This is the ONLY point in the purchase cycle where stock quantity increases.")

        self.draw_sub_subsection("GRN Line Fields")
        self.draw_bullet("po_line_id - Links to the purchase order line (not purchase_order_line_id)")
        self.draw_bullet("received_quantity - Total quantity received from vendor")
        self.draw_bullet("accepted_quantity - Quantity that passed inspection")
        self.draw_bullet("rejected_quantity - Quantity failed inspection (with rejection reason)")
        self.draw_bullet("unit_cost - Cost per unit (used for stock valuation)")
        self.draw_bullet("batch_number / expiry_date - For batch-tracked items")

        self.draw_sub_subsection("What happens on GRN Confirmation?")
        self.draw_numbered_item(1, "Stock ledger entry created (transaction_type: grn_receipt)")
        self.draw_numbered_item(2, "stock_summary.available_quantity increased by accepted_quantity")
        self.draw_numbered_item(3, "PO line received_quantity updated")
        self.draw_numbered_item(4, "If all PO lines fully received, PO status may update")
        self.draw_numbered_item(5, "Unit cost recorded for FIFO/weighted-average valuation")

        # ─── VENDOR BILL ───
        if not self.check_space(180):
            self.new_page("SEC-04")
        self.y -= 8
        self.draw_subsection("Vendor Bill", "04.4")

        self.draw_sub_subsection("What is it?")
        self.draw_paragraph(
            "A vendor bill (purchase invoice) is the invoice received from the vendor for goods "
            "supplied. It records the financial obligation. Vendor bills do NOT affect stock - "
            "stock was already added during GRN. Bills must be approved before payment can be made."
        )

        self.draw_sub_subsection("Key Features")
        self.draw_bullet("Links to GRN or PO for cross-reference")
        self.draw_bullet("GST recalculated on bill (may differ from PO if discounts applied)")
        self.draw_bullet("TDS (Tax Deducted at Source) section tracking supported")
        self.draw_bullet("Bill lines require item_id for GST resolution via resolveGst")
        self.draw_bullet("Approval required before vendor payment can reference this bill")
        self.draw_bullet("Tracks amount_paid for partial payment support")
        self.draw_bullet("Approval method: vendorBillService.approveVendorBill()")

        # ─── VENDOR PAYMENT ───
        if not self.check_space(140):
            self.new_page("SEC-04")
        self.y -= 8
        self.draw_subsection("Vendor Payment", "04.5")

        self.draw_sub_subsection("What is it?")
        self.draw_paragraph(
            "Vendor payments record the actual payment made to the vendor against approved bills. "
            "Supports multiple payment modes and partial payments. Cheque payments can be bounced "
            "to reverse the payment."
        )

        self.draw_sub_subsection("Payment Modes")
        self.draw_bullet("Cash - Direct cash payment")
        self.draw_bullet("Bank Transfer - NEFT/RTGS/IMPS transfer")
        self.draw_bullet("Cheque - With cheque number and date tracking")
        self.draw_bullet("UPI - Digital payment via UPI")

        self.draw_sub_subsection("Confirmation Process")
        self.draw_paragraph(
            "On payment confirmation (vendorPaymentService.confirmVendorPayment): the vendor bill's "
            "amount_paid is updated. If fully paid, bill status changes to 'paid'. Advance payments "
            "(not linked to specific bill) are also supported."
        )

        self.draw_sub_subsection("Cheque Bounce")
        self.draw_paragraph(
            "If a cheque payment bounces, the bounce action reverses the payment: the vendor bill's "
            "amount_paid is decremented, and the payment status changes to 'bounced'."
        )

    def page_sales_cycle(self):
        """Section 05: Sales Cycle"""
        self.new_page("SEC-05")
        self.draw_section_header("05", "Sales Cycle",
                                "Complete order-to-cash workflow")

        # Flow diagram
        flow_nodes = [
            ("Sales\nQuotation", SALES_COLOR),
            ("Sales\nOrder", SALES_COLOR),
            ("Delivery\nChallan", INVENTORY_COLOR),
            ("Sales\nInvoice", FINANCE_COLOR),
            ("Payment\nReceipt", FINANCE_COLOR),
        ]

        node_w = 85
        node_h = 30
        gap = 14
        start_x = MARGIN + 8
        node_y = self.y - 35

        for i, (text, color) in enumerate(flow_nodes):
            x = start_x + i * (node_w + gap)
            self.draw_flow_node(x, node_y, node_w, node_h, text, color, WHITE, 7.5)
            if i < len(flow_nodes) - 1:
                self.draw_flow_arrow_right(x + node_w + 2, node_y + node_h/2,
                                          x + node_w + gap - 2, AMBER)

        self.y = node_y - 15
        labels = ["Quote", "Order", "Dispatch", "Invoice", "Collect"]
        for i, label in enumerate(labels):
            x = start_x + i * (node_w + gap) + node_w/2
            self.draw_text(label, x, self.y, 'GeistMono', 7, SLATE, align='center')
        self.y -= 20

        # ─── SALES QUOTATION ───
        self.draw_subsection("Sales Quotation", "05.1")
        self.draw_paragraph(
            "A sales quotation is a price proposal sent to a customer. It includes products with "
            "pricing, discounts, and GST calculation. Quotations can be sent, accepted, rejected, "
            "or expired. Accepted quotations can be converted to sales orders."
        )

        self.draw_sub_subsection("Status Flow")
        sq_statuses = [
            ("Draft", SLATE_PALE, CHARCOAL),
            ("Sent", HexColor('#DBEAFE'), PURCHASE_COLOR),
            ("Accepted", HexColor('#D1FAE5'), GREEN),
            ("Converted", HexColor('#F3E8FF'), PURPLE),
        ]
        sx = MARGIN + 10
        for i, (status, bg, fg) in enumerate(sq_statuses):
            w = self.draw_status_node(sx, self.y - 20, status, bg, fg)
            if i < len(sq_statuses) - 1:
                self.draw_flow_arrow_right(sx + w + 3, self.y - 11, sx + w + 18, SLATE_LIGHT)
                sx += w + 22
            else:
                sx += w + 8

        # Also show rejected/expired branching
        self.draw_text("Also: Rejected, Expired, Reverted to Draft",
                      MARGIN + 10, self.y - 38, 'CrimsonPro-Italic', 8.5, SLATE)
        self.y -= 50

        self.draw_sub_subsection("Key Features")
        self.draw_bullet("Products added with unit price, quantity, discount %, and GST")
        self.draw_bullet("Valid-until date with automatic batch expiry (expire-overdue endpoint)")
        self.draw_bullet("Duplicate quotation to quickly create similar quotes")
        self.draw_bullet("Convert to Sales Order copies all line items and pricing")
        self.draw_bullet("Revert to Draft allows editing after sending")

        # ─── SALES ORDER ───
        if not self.check_space(200):
            self.new_page("SEC-05")
        self.y -= 8
        self.draw_subsection("Sales Order (SO)", "05.2")

        self.draw_sub_subsection("What is it?")
        self.draw_paragraph(
            "A sales order is a confirmed commitment to deliver products to a customer. It can be "
            "created standalone or from an accepted quotation. The critical action is CONFIRMATION - "
            "this reserves stock for the order."
        )

        self.draw_note_box("STOCK IMPACT",
            "SO CONFIRMATION creates stock reservations. Reserved quantity is blocked from the available stock so other orders cannot claim it.")

        self.draw_sub_subsection("Status Flow")
        so_statuses = [
            ("Draft", SLATE_PALE, CHARCOAL),
            ("Confirmed", HexColor('#D1FAE5'), GREEN),
            ("Part. Delivered", HexColor('#DBEAFE'), PURCHASE_COLOR),
            ("Delivered", HexColor('#D1FAE5'), GREEN),
        ]
        sx = MARGIN + 10
        for i, (status, bg, fg) in enumerate(so_statuses):
            w = self.draw_status_node(sx, self.y - 20, status, bg, fg, w=95)
            if i < len(so_statuses) - 1:
                self.draw_flow_arrow_right(sx + 97, self.y - 11, sx + 112, SLATE_LIGHT)
                sx += 117
            else:
                sx += 100
        self.y -= 38
        self.draw_text("Also: Invoiced, Closed, Cancelled",
                      MARGIN + 10, self.y + 5, 'CrimsonPro-Italic', 8.5, SLATE)
        self.y -= 10

        self.draw_sub_subsection("SO Line Tracking")
        self.draw_bullet("ordered_quantity - Quantity ordered by customer")
        self.draw_bullet("delivered_quantity - Updated when delivery challan is confirmed")
        self.draw_bullet("invoiced_quantity - Updated when sales invoice is created")
        self.draw_bullet("Partial delivery and partial invoicing both supported")

        self.draw_sub_subsection("What happens on SO Confirmation?")
        self.draw_numbered_item(1, "Stock reservation created in stock_reservations table")
        self.draw_numbered_item(2, "stock_summary.reserved_quantity increased")
        self.draw_numbered_item(3, "Available free stock (available - reserved) decreases")
        self.draw_numbered_item(4, "If product has BOM, work order may be auto-created")

        # ─── DELIVERY CHALLAN ───
        if not self.check_space(180):
            self.new_page("SEC-05")
        self.y -= 8
        self.draw_subsection("Delivery Challan (Packing Slip)", "05.3")

        self.draw_sub_subsection("What is it?")
        self.draw_paragraph(
            "A delivery challan documents the physical dispatch of goods from the warehouse to the "
            "customer. It is the point where stock actually leaves the warehouse. Partial deliveries "
            "are supported - you can create multiple challans against one sales order."
        )

        self.draw_note_box("STOCK IMPACT",
            "DELIVERY CHALLAN CONFIRMATION deducts stock from the warehouse. This is the ONLY point in the sales cycle where stock decreases.")

        self.draw_sub_subsection("What happens on Delivery Confirmation?")
        self.draw_numbered_item(1, "Stock ledger entry created (transaction_type: sales_dispatch)")
        self.draw_numbered_item(2, "stock_summary.available_quantity decreased")
        self.draw_numbered_item(3, "Stock reservation released (reserved_quantity decreased)")
        self.draw_numbered_item(4, "SO line delivered_quantity updated")
        self.draw_numbered_item(5, "If all SO lines fully delivered, SO status changes to 'delivered'")

        # ─── SALES INVOICE ───
        if not self.check_space(180):
            self.new_page("SEC-05")
        self.y -= 8
        self.draw_subsection("Sales Invoice", "05.4")

        self.draw_sub_subsection("What is it?")
        self.draw_paragraph(
            "A sales invoice is the tax document sent to the customer requesting payment. It records "
            "the financial receivable. Invoices do NOT affect stock (already deducted at delivery). "
            "Invoices can be created from a sales order or standalone."
        )

        self.draw_sub_subsection("Key Features")
        self.draw_bullet("Created from sales order (from-sales-order endpoint) or standalone")
        self.draw_bullet("GST recalculated on invoice (may differ from SO if discounts change)")
        self.draw_bullet("E-invoice IRN (Invoice Reference Number) support for GST compliance")
        self.draw_bullet("Batch mark-overdue endpoint for automatic overdue detection")
        self.draw_bullet("Outstanding amount tracking per customer")
        self.draw_bullet("Tracks amount_paid for partial payment support")

        self.draw_sub_subsection("Status Flow")
        inv_statuses = [
            ("Draft", SLATE_PALE, CHARCOAL),
            ("Approved", HexColor('#D1FAE5'), GREEN),
            ("Sent", HexColor('#DBEAFE'), PURCHASE_COLOR),
            ("Part. Paid", HexColor('#FEF3C7'), SALES_COLOR),
            ("Paid", HexColor('#D1FAE5'), GREEN),
        ]
        sx = MARGIN + 10
        for i, (status, bg, fg) in enumerate(inv_statuses):
            w = self.draw_status_node(sx, self.y - 20, status, bg, fg, w=80)
            if i < len(inv_statuses) - 1:
                self.draw_flow_arrow_right(sx + 82, self.y - 11, sx + 94, SLATE_LIGHT)
                sx += 97
            else:
                sx += 85
        self.y -= 38
        self.draw_text("Also: Overdue, Cancelled",
                      MARGIN + 10, self.y + 5, 'CrimsonPro-Italic', 8.5, SLATE)
        self.y -= 12

        # ─── CREDIT NOTE ───
        if not self.check_space(100):
            self.new_page("SEC-05")
        self.y -= 8
        self.draw_subsection("Credit Notes (Sales Returns)", "05.5")
        self.draw_paragraph(
            "Credit notes handle sales returns. When a customer returns goods or a pricing adjustment "
            "is needed, a credit note is issued against the original invoice. Credit notes require "
            "approval before they take effect."
        )
        self.draw_bullet("Links to original sales invoice")
        self.draw_bullet("Line items specify returned quantity and reason")
        self.draw_bullet("Approval workflow: draft -> approved")
        self.draw_bullet("Reduces the customer's outstanding balance")

        # ─── PAYMENT RECEIPT ───
        if not self.check_space(200):
            self.new_page("SEC-05")
        self.y -= 8
        self.draw_subsection("Payment Receipt (Customer Payment)", "05.6")

        self.draw_sub_subsection("What is it?")
        self.draw_paragraph(
            "Payment receipts record money received from customers. They can be linked to specific "
            "invoices or recorded as advance payments for future allocation. Multiple payment modes "
            "are supported."
        )

        self.draw_sub_subsection("Payment Modes")
        self.draw_bullet("Cash, Bank Transfer, Cheque (with cheque no. and date), UPI, Card")

        self.draw_sub_subsection("Key Features")
        self.draw_bullet("TDS deduction support - customer may deduct TDS before paying")
        self.draw_bullet("Advance payments (not linked to invoice) can be allocated later")
        self.draw_bullet("Allocation endpoint to apply advances against invoices")
        self.draw_bullet("Cheque bounce reverses the payment and reverts invoice status")
        self.draw_bullet("Customer payment history and unallocated advances tracking")

        self.draw_sub_subsection("Confirmation Process")
        self.draw_paragraph(
            "On confirmation: the linked invoice's amount_paid is updated. If fully paid, invoice "
            "status changes to 'paid'. If partially paid, status changes to 'partially_paid'."
        )

    def page_inventory(self):
        """Section 06: Inventory Management"""
        self.new_page("SEC-06")
        self.draw_section_header("06", "Inventory Management",
                                "Stock tracking, movements, and valuation")

        self.draw_subsection("Stock Ledger (Append-Only Log)", "06.1")
        self.draw_paragraph(
            "The stock ledger is the single source of truth for all inventory movements. It is an "
            "append-only transaction log - entries are never modified or deleted. Every stock movement "
            "creates a new entry with quantity in/out and running balance."
        )

        self.draw_sub_subsection("Stock Ledger Entry Fields")
        cols = [("Field", 120), ("Description", 385)]
        self.draw_table_header(cols)
        rows = [
            ("transaction_type", "grn_receipt, production_in, sales_dispatch, transfer_in/out, adjustment, scrap"),
            ("reference_type", "grn, work_order, invoice, transfer, adjustment, delivery_challan"),
            ("reference_id", "ID of the source document (GRN, work order, etc.)"),
            ("item_id", "Which item was moved"),
            ("warehouse_id", "Which warehouse was affected"),
            ("quantity_in", "Quantity entering warehouse (positive on receipt)"),
            ("quantity_out", "Quantity leaving warehouse (positive on dispatch)"),
            ("balance_quantity", "Running balance after this transaction"),
            ("unit_cost", "Cost per unit at time of transaction"),
            ("total_value", "Total value of this movement"),
            ("batch_id", "Batch reference for batch-tracked items"),
            ("serial_number", "Serial number for serialized items"),
        ]
        for i, (field, desc) in enumerate(rows):
            if not self.check_space(20):
                self.new_page("SEC-06")
                self.draw_table_header(cols)
            self.draw_table_row([field, desc], cols, alt=i%2==1)

        self.y -= 12
        self.draw_subsection("Stock Summary (Materialized View)", "06.2")
        self.draw_paragraph(
            "The stock summary table maintains a materialized per-item, per-warehouse balance. "
            "It is updated in real-time as stock ledger entries are created. This provides fast "
            "queries for current stock levels without scanning the entire ledger."
        )

        summary_fields = [
            ("available_quantity", "Total stock physically available in warehouse"),
            ("reserved_quantity", "Blocked for confirmed sales orders"),
            ("on_order_quantity", "Expected from pending purchase orders"),
            ("in_production_quantity", "Being manufactured via work orders"),
            ("free_quantity", "available - reserved (actually allocatable)"),
            ("valuation_rate", "Current cost rate (FIFO or weighted average)"),
            ("total_value", "Total inventory value at this warehouse"),
        ]
        for field, desc in summary_fields:
            self.draw_text(field, MARGIN + 10, self.y, 'GeistMono', 8, TEAL)
            self.draw_text(desc, MARGIN + 185, self.y, 'CrimsonPro', 9.5, CHARCOAL)
            self.y -= 15

        self.y -= 8
        self.draw_subsection("Stock Transfers", "06.3")
        self.draw_paragraph(
            "Stock transfers move items between warehouses within the same company. Each transfer "
            "specifies source warehouse, target warehouse, and items with quantities. On confirmation, "
            "stock is deducted from source and added to target warehouse simultaneously."
        )
        self.draw_bullet("Creates two stock ledger entries: transfer_out (source) and transfer_in (target)")
        self.draw_bullet("Both entries reference the same transfer document")
        self.draw_bullet("Draft transfers can be edited; confirmed transfers are final")

        if not self.check_space(120):
            self.new_page("SEC-06")
        self.y -= 8
        self.draw_subsection("Stock Adjustments", "06.4")
        self.draw_paragraph(
            "Stock adjustments handle discrepancies between system stock and physical stock. "
            "Used after physical inventory counts. Each adjustment specifies the item, warehouse, "
            "and the adjustment quantity (positive for surplus, negative for shortage)."
        )
        self.draw_bullet("Requires approval before stock is affected")
        self.draw_bullet("Creates stock ledger entry with transaction_type: adjustment")
        self.draw_bullet("Reason tracking for audit trail (damage, theft, counting error, etc.)")

        if not self.check_space(100):
            self.new_page("SEC-06")
        self.y -= 8
        self.draw_subsection("Batch & Serial Tracking", "06.5")
        self.draw_paragraph(
            "Items can be tracked by batch number and/or serial number. Batches include expiry "
            "date tracking for perishable items. Serial numbers provide individual unit tracking "
            "for high-value items. FIFO valuation uses batch creation dates."
        )

        self.y -= 8
        self.draw_subsection("Stock Valuation", "06.6")
        self.draw_paragraph(
            "Inventory valuation calculates the total monetary value of stock. The system supports "
            "FIFO (First-In-First-Out) and weighted average cost methods. Unit cost is recorded at "
            "GRN confirmation (purchase cost) and production entry (manufacturing cost). The valuation "
            "report provides per-item, per-warehouse value breakdown."
        )

    def page_manufacturing(self):
        """Section 07: Manufacturing"""
        self.new_page("SEC-07")
        self.draw_section_header("07", "Manufacturing & Production",
                                "Work orders, material management, and production tracking")

        # Flow diagram
        flow_nodes = [
            ("Create\nWork Order", MANUFACTURING_COLOR),
            ("Approve\n& Start", MANUFACTURING_COLOR),
            ("Issue\nMaterials", INVENTORY_COLOR),
            ("Record\nProduction", MANUFACTURING_COLOR),
            ("Complete\n& Close", GREEN),
        ]

        node_w = 85
        node_h = 30
        gap = 14
        start_x = MARGIN + 8
        node_y = self.y - 35

        for i, (text, color) in enumerate(flow_nodes):
            x = start_x + i * (node_w + gap)
            self.draw_flow_node(x, node_y, node_w, node_h, text, color, WHITE, 7.5)
            if i < len(flow_nodes) - 1:
                self.draw_flow_arrow_right(x + node_w + 2, node_y + node_h/2,
                                          x + node_w + gap - 2, AMBER)
        self.y = node_y - 20

        self.draw_subsection("Work Order Lifecycle", "07.1")

        self.draw_sub_subsection("Status Flow")
        wo_statuses = [
            ("Draft", SLATE_PALE, CHARCOAL),
            ("Approved", HexColor('#D1FAE5'), GREEN),
            ("In Production", HexColor('#DBEAFE'), PURCHASE_COLOR),
            ("Completed", HexColor('#D1FAE5'), GREEN),
            ("Closed", HexColor('#F3F4F6'), SLATE),
        ]
        sx = MARGIN + 10
        for i, (status, bg, fg) in enumerate(wo_statuses):
            w = self.draw_status_node(sx, self.y - 20, status, bg, fg, w=85)
            if i < len(wo_statuses) - 1:
                self.draw_flow_arrow_right(sx + 87, self.y - 11, sx + 97, SLATE_LIGHT)
                sx += 100
            else:
                sx += 90
        self.y -= 40

        self.draw_sub_subsection("Work Order Creation")
        self.draw_paragraph(
            "A work order authorizes the manufacturing of a product. It links to a Product and its "
            "approved BOM. The BOM is exploded to create work order lines (component requirements). "
            "Source warehouse (raw materials) and target warehouse (finished goods) must be specified."
        )
        self.draw_bullet("product_id - Which finished product to manufacture")
        self.draw_bullet("bom_id - Which BOM recipe to follow")
        self.draw_bullet("planned_quantity - How many units to produce")
        self.draw_bullet("source_warehouse_id - Where raw materials are stored")
        self.draw_bullet("target_warehouse_id - Where finished goods will be received")
        self.draw_bullet("planned_start_date / planned_end_date - Production schedule")
        self.draw_bullet("Auto-created when SO confirmed (if product has active BOM)")

        if not self.check_space(160):
            self.new_page("SEC-07")
        self.y -= 8
        self.draw_subsection("Material Issue & Consumption", "07.2")

        self.draw_sub_subsection("Material Issue (issue-materials)")
        self.draw_paragraph(
            "Issues required raw materials from the source warehouse to the production floor. "
            "This physically removes items from the warehouse and allocates them to the work order."
        )
        self.draw_note_box("STOCK IMPACT",
            "Material issue DEDUCTS stock from source warehouse (transaction_type: production_out in stock ledger).")

        self.draw_sub_subsection("Material Consumption (consume-materials)")
        self.draw_paragraph(
            "Records actual consumption during production. Compares BOM-required quantities vs actual "
            "consumed quantities to calculate variance (wastage). Scrap/waste is tracked separately."
        )

        self.draw_sub_subsection("Material Return (return-materials)")
        self.draw_paragraph(
            "Returns unused materials from production floor back to the source warehouse. Creates "
            "a stock ledger entry adding stock back to the warehouse."
        )

        if not self.check_space(140):
            self.new_page("SEC-07")
        self.y -= 8
        self.draw_subsection("Production Entries", "07.3")
        self.draw_paragraph(
            "A production entry records the completion of finished goods. It adds the manufactured "
            "product to the target warehouse stock."
        )
        self.draw_note_box("STOCK IMPACT",
            "Production entry ADDS finished goods to target warehouse (transaction_type: production_in in stock ledger).")
        self.draw_bullet("Records quantity produced with batch and serial number tracking")
        self.draw_bullet("Links back to work order for production tracking")
        self.draw_bullet("Manufacturing cost calculated from consumed material costs")

        if not self.check_space(120):
            self.new_page("SEC-07")
        self.y -= 8
        self.draw_subsection("Scrap Entries", "07.4")
        self.draw_paragraph(
            "Scrap entries record defective, damaged, expired, or waste items generated during "
            "manufacturing or found in warehouse."
        )
        self.draw_bullet("Reason categories: defective, damaged, expired, process_waste")
        self.draw_bullet("Disposal methods: sell, recycle, discard")
        self.draw_bullet("Scrap analysis report for tracking waste patterns")
        self.draw_note_box("STOCK IMPACT",
            "Scrap entries DEDUCT stock from warehouse (transaction_type: scrap in stock ledger).")

    def page_accounting(self):
        """Section 08: Accounting & Finance"""
        self.new_page("SEC-08")
        self.draw_section_header("08", "Accounting & Finance",
                                "Double-entry bookkeeping, ledger, and financial statements")

        self.draw_subsection("Chart of Accounts (COA)", "08.1")
        self.draw_paragraph(
            "The chart of accounts is a hierarchical tree structure organizing all financial accounts. "
            "It is seeded with standard account types during initial setup and can be customized. "
            "Each account has a parent, creating a multi-level tree."
        )

        self.draw_sub_subsection("Account Types Hierarchy")

        # Account type tree visualization
        account_types = [
            ("Asset", INVENTORY_COLOR, [
                "Current Asset", "Fixed Asset", "Bank", "Cash", "Receivable", "Inventory"
            ]),
            ("Liability", PURCHASE_COLOR, [
                "Payable", "Duty & Tax", "Loan"
            ]),
            ("Equity", PURPLE, [
                "Capital", "Reserve"
            ]),
            ("Revenue", SALES_COLOR, [
                "Income"
            ]),
            ("Expense", MANUFACTURING_COLOR, [
                "COGS", "Direct Expense", "Indirect Expense"
            ]),
        ]

        for root_type, color, children in account_types:
            if not self.check_space(18 + len(children) * 14):
                self.new_page("SEC-08")
            self.draw_rect(MARGIN + 5, self.y - 14, 80, 16, fill=color, radius=3)
            self.draw_text(root_type, MARGIN + 45, self.y - 10, 'InstrumentSans-Bold', 8.5, WHITE, align='center')
            child_x = MARGIN + 100
            for child in children:
                self.draw_text("\u2514", child_x - 10, self.y - 10, 'CrimsonPro', 9, SLATE_LIGHT)
                self.draw_text(child, child_x, self.y - 10, 'CrimsonPro', 9, CHARCOAL)
                child_x += self.text_width(child, 'CrimsonPro', 9) + 18
                if child_x > W - MARGIN - 50:
                    child_x = MARGIN + 100
                    self.y -= 14
            self.y -= 22

        self.y -= 8
        self.draw_subsection("Double-Entry Vouchers", "08.2")
        self.draw_paragraph(
            "All financial transactions are recorded as double-entry vouchers. Every voucher must "
            "have balanced debit and credit entries (total debits = total credits). Vouchers are "
            "append-only - to correct an error, a reversal voucher is created with opposite entries."
        )

        self.draw_sub_subsection("Voucher Types")
        self.draw_bullet("Sales - Revenue recognition from customer invoices")
        self.draw_bullet("Purchase - Expense recording from vendor bills")
        self.draw_bullet("Receipt - Cash/bank receipt from customers")
        self.draw_bullet("Payment - Cash/bank payment to vendors")
        self.draw_bullet("Journal - General journal entries for adjustments")
        self.draw_bullet("Contra - Bank-to-bank or cash-to-bank transfers")

        if not self.check_space(160):
            self.new_page("SEC-08")
        self.y -= 8
        self.draw_subsection("Ledger Entries", "08.3")
        self.draw_paragraph(
            "The ledger is the core accounting record. Each voucher line creates a ledger entry with "
            "account_id, debit/credit amount, and narration. The ledger is append-only - entries are "
            "never modified. Account balances are computed by summing all ledger entries for that account."
        )

        self.draw_sub_subsection("Party Ledger")
        self.draw_paragraph(
            "The party ledger provides transaction history for specific customers or vendors. It shows "
            "all debit/credit entries with running balance, invoice references, and payment details. "
            "Accessed via: GET /api/finance/party-ledger/:partyType/:partyId"
        )

        if not self.check_space(200):
            self.new_page("SEC-08")
        self.y -= 8
        self.draw_subsection("Financial Statements", "08.4")

        self.draw_sub_subsection("Trial Balance")
        self.draw_paragraph(
            "Shows debit and credit balances for every account in the chart of accounts. Total debits "
            "must equal total credits. Used to verify the integrity of the double-entry system before "
            "generating financial statements."
        )

        self.draw_sub_subsection("Profit & Loss Statement")
        self.draw_paragraph(
            "Shows Revenue minus Expenses to calculate Net Profit or Loss for a given period. "
            "Revenue accounts (income) are shown as credits, expense accounts (COGS, direct, indirect) "
            "as debits. The difference is the net result for the period."
        )

        self.draw_sub_subsection("Balance Sheet")
        self.draw_paragraph(
            "Shows the financial position: Assets = Liabilities + Equity. Asset accounts on one side, "
            "liability and equity accounts on the other. The equation must always balance."
        )

        self.draw_sub_subsection("Outstanding Reports")
        self.draw_bullet("Outstanding Receivables - Amounts owed by customers (unpaid invoices)")
        self.draw_bullet("Outstanding Payables - Amounts owed to vendors (unpaid bills)")
        self.draw_bullet("Aging reports break down outstanding by time period (0-30, 31-60, 61-90, 90+ days)")

    def page_gst(self):
        """Section 09: GST & Tax"""
        self.new_page("SEC-09")
        self.draw_section_header("09", "GST & Tax Compliance",
                                "Tax calculation, reverse charge, TDS/TCS")

        self.draw_subsection("GST Calculation Logic", "09.1")
        self.draw_paragraph(
            "GST (Goods and Services Tax) is calculated automatically on every sales and purchase "
            "transaction. The type of GST applied depends on the place of supply relative to the "
            "company's location."
        )

        # GST type diagram
        self.y -= 5
        box_w = (CONTENT_W - 30) / 2

        # Intra-state box
        self.draw_rect(MARGIN, self.y - 75, box_w, 75, fill=HexColor('#EFF6FF'),
                       stroke=PURCHASE_COLOR, stroke_w=0.5, radius=4)
        self.draw_text("INTRA-STATE", MARGIN + box_w/2, self.y - 15,
                      'InstrumentSans-Bold', 11, PURCHASE_COLOR, align='center')
        self.draw_text("Same state transaction", MARGIN + box_w/2, self.y - 30,
                      'CrimsonPro-Italic', 9, SLATE, align='center')
        self.draw_text("CGST (9%) + SGST (9%) = 18%", MARGIN + box_w/2, self.y - 50,
                      'GeistMono-Bold', 9, PURCHASE_COLOR, align='center')
        self.draw_text("Central + State GST", MARGIN + box_w/2, self.y - 64,
                      'CrimsonPro', 8.5, SLATE, align='center')

        # Inter-state box
        x2 = MARGIN + box_w + 30
        self.draw_rect(x2, self.y - 75, box_w, 75, fill=HexColor('#FEF3C7'),
                       stroke=SALES_COLOR, stroke_w=0.5, radius=4)
        self.draw_text("INTER-STATE", x2 + box_w/2, self.y - 15,
                      'InstrumentSans-Bold', 11, SALES_COLOR, align='center')
        self.draw_text("Different state transaction", x2 + box_w/2, self.y - 30,
                      'CrimsonPro-Italic', 9, SLATE, align='center')
        self.draw_text("IGST (18%)", x2 + box_w/2, self.y - 50,
                      'GeistMono-Bold', 9, SALES_COLOR, align='center')
        self.draw_text("Integrated GST", x2 + box_w/2, self.y - 64,
                      'CrimsonPro', 8.5, SLATE, align='center')

        self.y -= 90

        self.draw_sub_subsection("How GST Type is Determined")
        self.draw_paragraph(
            "The system compares the company branch's state with the counterparty's state. For sales: "
            "branch state vs customer shipping address state. For purchases: branch state vs vendor "
            "address state. Vendor addresses are stored in the polymorphic addresses table with "
            "entity_type='vendor'."
        )

        self.draw_sub_subsection("GST Calculation Points")
        self.draw_numbered_item(1, "Sales Quotation: GST calculated for price estimation (not posted to ledger)")
        self.draw_numbered_item(2, "Sales Order: GST recalculated on confirmation (not posted)")
        self.draw_numbered_item(3, "Sales Invoice: GST is final authority - this is what gets posted/reported")
        self.draw_numbered_item(4, "Purchase Order: GST calculated for vendor reference")
        self.draw_numbered_item(5, "Vendor Bill: GST recalculated (final for purchase accounting)")

        if not self.check_space(140):
            self.new_page("SEC-09")
        self.y -= 8
        self.draw_subsection("Reverse Charge Mechanism", "09.2")
        self.draw_paragraph(
            "Under reverse charge, the buyer (company) pays the GST instead of the vendor. This "
            "applies to specified goods/services or when purchasing from unregistered dealers. "
            "When is_reverse_charge=true on a vendor bill, the company self-assesses and pays the GST."
        )

        self.y -= 6
        self.draw_subsection("TDS & TCS", "09.3")
        self.draw_sub_subsection("TDS (Tax Deducted at Source)")
        self.draw_paragraph(
            "TDS is deducted by the payer (company) on payments to vendors. The company withholds "
            "a percentage and remits it to the government. TDS section codes are tracked (194A, 194C, "
            "194D, etc.). Applied on vendor payments."
        )

        self.draw_sub_subsection("TCS (Tax Collected at Source)")
        self.draw_paragraph(
            "TCS is collected by the seller (company) from customers at the point of sale. The "
            "collected amount is remitted to the government. Applied on sales invoices."
        )

        if not self.check_space(100):
            self.new_page("SEC-09")
        self.y -= 6
        self.draw_subsection("HSN/SAC Codes", "09.4")
        self.draw_paragraph(
            "Every item and product has an HSN (Harmonized System of Nomenclature) code for goods or "
            "SAC (Services Accounting Code) for services. These codes determine the applicable GST rate "
            "and are required for GSTR filing. The code is stored on item/product master and carried "
            "forward to invoice lines."
        )

        self.y -= 6
        self.draw_subsection("Place of Supply", "09.5")
        self.draw_paragraph(
            "Place of supply determines which state's GST applies. For goods: determined by shipping "
            "address (delivery location). For services: determined by recipient's location. The system "
            "resolves this from the addresses table using the polymorphic entity_type."
        )

    def page_bank_management(self):
        """Section 10: Bank & Cash"""
        self.new_page("SEC-10")
        self.draw_section_header("10", "Bank & Cash Management",
                                "Bank accounts, reconciliation, payment processing")

        self.draw_subsection("Bank Accounts", "10.1")
        self.draw_paragraph(
            "Bank accounts are created during initial setup and linked to ledger accounts in the "
            "chart of accounts. Each bank account stores: bank name, account number, IFSC code, "
            "branch name, and account type (current/savings). The account balance is derived from "
            "the linked ledger account."
        )

        self.draw_sub_subsection("Account Types")
        self.draw_bullet("Current Account - For business transactions")
        self.draw_bullet("Savings Account - For holding reserves")
        self.draw_bullet("Cash Account - For petty cash management")

        self.y -= 8
        self.draw_subsection("Bank Reconciliation", "10.2")
        self.draw_paragraph(
            "Bank reconciliation matches the company's ledger entries with the bank statement to "
            "identify discrepancies. The process involves importing bank statement entries and "
            "matching them against ledger transactions."
        )

        self.draw_sub_subsection("Reconciliation Process")
        self.draw_numbered_item(1, "Import bank statement entries (manual or bulk import)")
        self.draw_numbered_item(2, "Review unmatched entries from both bank statement and ledger")
        self.draw_numbered_item(3, "Match bank statement entries to corresponding ledger entries")
        self.draw_numbered_item(4, "Identify outstanding cheques (in ledger but not in bank)")
        self.draw_numbered_item(5, "Identify deposits in transit (in bank but not in ledger)")
        self.draw_numbered_item(6, "Review reconciliation summary for balance verification")

        self.draw_sub_subsection("Key Operations")
        self.draw_bullet("Match - Links a bank statement entry to a ledger entry")
        self.draw_bullet("Unmatch - Removes the match if incorrectly linked")
        self.draw_bullet("Reconciliation Summary - Shows matched, unmatched, and outstanding items")
        self.draw_bullet("Bulk Import - Import bank statements from CSV/Excel files")

        self.y -= 8
        self.draw_subsection("Payment Processing", "10.3")
        self.draw_paragraph(
            "All payments (customer receipts and vendor payments) can be routed through bank accounts. "
            "When a payment is confirmed, the corresponding bank account's ledger is updated. "
            "Supported payment modes across the system:"
        )

        cols = [("Mode", 100), ("Usage", 180), ("Special Fields", 225)]
        self.draw_table_header(cols)
        payment_modes = [
            ("Cash", "Immediate payment/receipt", "No additional fields needed"),
            ("Bank Transfer", "NEFT/RTGS/IMPS", "Bank account selection, UTR number"),
            ("Cheque", "Cheque payment/receipt", "Cheque number, cheque date, bank details"),
            ("UPI", "Digital payment", "UPI reference/transaction ID"),
            ("Card", "Card payment (receipts)", "Card reference number"),
        ]
        for i, (mode, usage, fields) in enumerate(payment_modes):
            self.draw_table_row([mode, usage, fields], cols, alt=i%2==1)

    def page_reports(self):
        """Section 11: Reports"""
        self.new_page("SEC-11")
        self.draw_section_header("11", "Reports & Analytics",
                                "Available reports across all modules")

        report_sections = [
            ("Inventory Reports", "11.1", [
                ("Inventory Summary", "/api/reports/inventory-summary",
                 "Current stock levels per item per warehouse with valuation"),
                ("Stock Ledger", "/api/inventory/stock-ledger",
                 "Complete transaction history with filters by item, warehouse, date range"),
                ("Stock Summary", "/api/inventory/stock-summary",
                 "Available, reserved, on-order quantities per item per warehouse"),
                ("Stock Valuation", "/api/inventory/valuation",
                 "Total inventory value using FIFO or weighted average method"),
                ("Scrap Analysis", "/api/manufacturing/scrap-analysis",
                 "Scrap trends by reason, product, and time period"),
            ]),
            ("Sales Reports", "11.2", [
                ("Sales Summary", "/api/reports/sales-summary",
                 "Revenue analysis by customer, product, period"),
                ("Aging Receivables", "/api/reports/aging-receivables",
                 "Customer outstanding broken by age buckets (0-30, 31-60, 61-90, 90+ days)"),
                ("Outstanding Receivables", "/api/finance/outstanding-receivables",
                 "Total amounts owed by each customer"),
                ("Customer Payment History", "/api/payment-receipts/customer-history/:id",
                 "All payments received from a specific customer"),
                ("Customer Outstanding", "/api/sales-invoices/outstanding/:customerId",
                 "Unpaid invoices for a specific customer"),
            ]),
            ("Purchase Reports", "11.3", [
                ("Purchase Summary", "/api/reports/purchase-summary",
                 "Spend analysis by vendor, item, period"),
                ("Aging Payables", "/api/reports/aging-payables",
                 "Vendor outstanding broken by age buckets"),
                ("Outstanding Payables", "/api/finance/outstanding-payables",
                 "Total amounts owed to each vendor"),
                ("Vendor Outstanding", "/api/vendor-bills/outstanding/:vendorId",
                 "Unpaid bills for a specific vendor"),
            ]),
            ("Financial Reports", "11.4", [
                ("Trial Balance", "/api/finance/trial-balance",
                 "All account balances with debit/credit totals"),
                ("Profit & Loss", "/api/finance/profit-and-loss",
                 "Revenue minus expenses for a period"),
                ("Balance Sheet", "/api/finance/balance-sheet",
                 "Assets, liabilities, and equity at a point in time"),
                ("Account Ledger", "/api/finance/account-ledger/:accountId",
                 "Transaction details for a specific account"),
                ("Party Ledger", "/api/finance/party-ledger/:partyType/:partyId",
                 "Customer or vendor transaction history with running balance"),
                ("Bank Reconciliation", "/api/finance/bank-reconciliation/:bankAccountId/summary",
                 "Reconciliation status and outstanding items"),
            ]),
        ]

        for section_title, section_num, reports in report_sections:
            if not self.check_space(50 + len(reports) * 45):
                self.new_page("SEC-11")
            self.draw_subsection(section_title, section_num)
            for name, endpoint, desc in reports:
                if not self.check_space(40):
                    self.new_page("SEC-11")
                self.draw_text(name, MARGIN + 10, self.y, 'InstrumentSans-Bold', 9.5, NAVY)
                self.draw_text(endpoint, MARGIN + 10, self.y - 13, 'GeistMono', 7, TEAL)
                self.y -= 26
                self.y = self.draw_wrapped_text(desc, MARGIN + 10, self.y, CONTENT_W - 15,
                                               'CrimsonPro', 9, CHARCOAL, 12)
                self.y -= 10

    def page_stock_reference(self):
        """Section 12: Stock Impact Reference"""
        self.new_page("SEC-12")
        self.draw_section_header("12", "Stock Impact Reference",
                                "Complete reference: when stock increases, decreases, and gets reserved")

        # ─── STOCK INCREASES ───
        self.draw_subsection("When Stock INCREASES", "12.1")

        increase_events = [
            ("GRN Confirmation", "grn_receipt", "Purchase",
             "When goods are received from a vendor and the GRN is confirmed, "
             "accepted_quantity is added to the warehouse stock. Unit cost is recorded "
             "for valuation. This is the ONLY stock entry point in the purchase cycle."),
            ("Production Entry", "production_in", "Manufacturing",
             "When finished goods are produced and recorded via a production entry, "
             "the manufactured quantity is added to the target warehouse. This adds "
             "products (not items) to stock."),
            ("Stock Transfer In", "transfer_in", "Inventory",
             "When a stock transfer is confirmed, the target warehouse receives the "
             "transferred quantity. Note: this is paired with a transfer_out from source."),
            ("Stock Adjustment (+)", "adjustment", "Inventory",
             "Positive stock adjustments (surplus found during physical count) add "
             "to warehouse stock after approval."),
            ("Material Return", "production_in", "Manufacturing",
             "When unused materials are returned from the production floor back to "
             "the warehouse, stock is restored."),
        ]

        for title, txn_type, module, desc in increase_events:
            if not self.check_space(60):
                self.new_page("SEC-12")
            self.draw_rect(MARGIN, self.y - 2, 4, 14, fill=GREEN)
            self.draw_text(title, MARGIN + 12, self.y, 'InstrumentSans-Bold', 10, NAVY)
            self.draw_text(f"txn: {txn_type}", MARGIN + 200, self.y + 1, 'GeistMono', 7, TEAL)
            self.draw_text(f"[{module}]", W - MARGIN, self.y + 1, 'GeistMono', 7, SLATE, align='right')
            self.y -= 16
            self.y = self.draw_wrapped_text(desc, MARGIN + 12, self.y, CONTENT_W - 15,
                                           'CrimsonPro', 9.5, CHARCOAL, 13)
            self.y -= 10

        # ─── STOCK DECREASES ───
        if not self.check_space(60):
            self.new_page("SEC-12")
        self.y -= 8
        self.draw_subsection("When Stock DECREASES", "12.2")

        decrease_events = [
            ("Delivery Challan Confirmation", "sales_dispatch", "Sales",
             "When goods are dispatched to a customer and the delivery challan is confirmed, "
             "stock is deducted from the warehouse. The stock reservation (from SO confirmation) "
             "is released simultaneously. This is the ONLY stock exit point in the sales cycle."),
            ("Work Order Material Issue", "production_out", "Manufacturing",
             "When raw materials are issued from the source warehouse to the production floor, "
             "stock is deducted. This happens after work order is started, before production."),
            ("Material Consumption", "production_out", "Manufacturing",
             "When materials are consumed during production, they are recorded as used. "
             "Actual vs BOM-required comparison reveals wastage variance."),
            ("Stock Transfer Out", "transfer_out", "Inventory",
             "When a stock transfer is confirmed, the source warehouse's stock is deducted. "
             "Paired with a transfer_in at the target warehouse."),
            ("Stock Adjustment (-)", "adjustment", "Inventory",
             "Negative stock adjustments (shortage found during physical count) deduct "
             "from warehouse stock after approval."),
            ("Scrap Entry", "scrap", "Manufacturing",
             "Defective, damaged, or expired items are scrapped and deducted from stock. "
             "Tracked by reason (defective, damaged, expired, process_waste)."),
        ]

        for title, txn_type, module, desc in decrease_events:
            if not self.check_space(60):
                self.new_page("SEC-12")
            self.draw_rect(MARGIN, self.y - 2, 4, 14, fill=ROSE)
            self.draw_text(title, MARGIN + 12, self.y, 'InstrumentSans-Bold', 10, NAVY)
            self.draw_text(f"txn: {txn_type}", MARGIN + 250, self.y + 1, 'GeistMono', 7, TEAL)
            self.draw_text(f"[{module}]", W - MARGIN, self.y + 1, 'GeistMono', 7, SLATE, align='right')
            self.y -= 16
            self.y = self.draw_wrapped_text(desc, MARGIN + 12, self.y, CONTENT_W - 15,
                                           'CrimsonPro', 9.5, CHARCOAL, 13)
            self.y -= 10

        # ─── STOCK RESERVATIONS ───
        if not self.check_space(80):
            self.new_page("SEC-12")
        self.y -= 8
        self.draw_subsection("When Stock Gets RESERVED", "12.3")

        self.draw_rect(MARGIN, self.y - 2, 4, 14, fill=AMBER)
        self.draw_text("Sales Order Confirmation", MARGIN + 12, self.y, 'InstrumentSans-Bold', 10, NAVY)
        self.y -= 16
        self.draw_paragraph(
            "When a sales order is confirmed, the ordered quantities are reserved in the "
            "stock_reservations table. This increases stock_summary.reserved_quantity and "
            "decreases the free stock (available - reserved). Reserved stock cannot be "
            "allocated to other orders."
        )

        self.y -= 4
        self.draw_rect(MARGIN, self.y - 2, 4, 14, fill=AMBER)
        self.draw_text("Reservation Release", MARGIN + 12, self.y, 'InstrumentSans-Bold', 10, NAVY)
        self.y -= 16
        self.draw_paragraph(
            "Reservations are released when the delivery challan is confirmed (goods physically "
            "dispatched). The reserved_quantity decreases as the actual stock deduction happens."
        )

        # ─── ON ORDER ───
        if not self.check_space(60):
            self.new_page("SEC-12")
        self.y -= 10
        self.draw_subsection("On-Order & In-Production Quantities", "12.4")
        self.draw_bullet("on_order_quantity - Increases when PO is approved (expected from vendors)")
        self.draw_bullet("on_order_quantity - Decreases when GRN is confirmed (goods received)")
        self.draw_bullet("in_production_quantity - Increases when work order is started")
        self.draw_bullet("in_production_quantity - Decreases when production entry is recorded")

    def page_doc_sequences(self):
        """Section 13: Document Sequences"""
        self.new_page("SEC-13")
        self.draw_section_header("13", "Document Numbering & Sequences",
                                "Automatic document number generation")

        self.draw_paragraph(
            "The system automatically generates unique document numbers using configurable sequences. "
            "Each document type has its own sequence with a prefix, current counter, and optional "
            "financial year reset."
        )

        self.draw_subsection("Standard Prefixes", "13.1")

        cols = [("Document Type", 160), ("Prefix", 80), ("Example", 120), ("FY Reset", 145)]
        self.draw_table_header(cols)

        sequences = [
            ("Sales Quotation", "SQ-", "SQ-0001", "Yes - resets each FY"),
            ("Sales Order", "SO-", "SO-0001", "Yes - resets each FY"),
            ("Delivery Challan", "DC-", "DC-0001", "Yes - resets each FY"),
            ("Sales Invoice", "INV-", "INV-0001", "Yes - resets each FY"),
            ("Credit Note", "CN-", "CN-0001", "Yes - resets each FY"),
            ("Purchase Requisition", "PR-", "PR-0001", "Yes - resets each FY"),
            ("Purchase Order", "PO-", "PO-0001", "Yes - resets each FY"),
            ("Goods Receipt Note", "GRN-", "GRN-0001", "Yes - resets each FY"),
            ("Vendor Bill", "VB-", "VB-0001", "Yes - resets each FY"),
            ("Debit Note", "DN-", "DN-0001", "Yes - resets each FY"),
            ("Work Order", "WO-", "WO-0001", "Yes - resets each FY"),
            ("Stock Transfer", "ST-", "ST-0001", "Yes - resets each FY"),
            ("Journal Voucher", "JV-", "JV-0001", "Yes - resets each FY"),
        ]

        for i, (doc, prefix, example, reset) in enumerate(sequences):
            if not self.check_space(20):
                self.new_page("SEC-13")
                self.draw_table_header(cols)
            self.draw_table_row([doc, prefix, example, reset], cols, alt=i%2==1)

        self.y -= 14
        self.draw_paragraph(
            "Document sequences are stored in the document_sequences table with company_id scoping. "
            "Numbers auto-increment and are guaranteed unique within a company and financial year."
        )

    def page_cheat_sheet(self):
        """Section 14: Quick Reference"""
        self.new_page("SEC-14")
        self.draw_section_header("14", "Quick Reference Cheat Sheet",
                                "Status flows, key methods, and common operations at a glance")

        self.draw_subsection("Status Flow Summary", "14.1")

        flows = [
            ("Purchase Requisition", "Draft -> Submitted -> Approved -> Converted (or Rejected)", PURCHASE_COLOR),
            ("Purchase Order", "Draft -> Approved -> Sent -> Closed (or Cancelled)", PURCHASE_COLOR),
            ("GRN", "Draft -> Confirmed (or Cancelled)", INVENTORY_COLOR),
            ("Vendor Bill", "Draft -> Approved (or Cancelled)", FINANCE_COLOR),
            ("Vendor Payment", "Draft -> Confirmed -> Bounced (optional)", FINANCE_COLOR),
            ("Sales Quotation", "Draft -> Sent -> Accepted -> Converted (or Rejected/Expired)", SALES_COLOR),
            ("Sales Order", "Draft -> Confirmed -> Part.Delivered -> Delivered -> Invoiced -> Closed", SALES_COLOR),
            ("Delivery Challan", "Draft -> Confirmed (or Cancelled)", INVENTORY_COLOR),
            ("Sales Invoice", "Draft -> Approved -> Sent -> Part.Paid -> Paid (or Overdue)", FINANCE_COLOR),
            ("Payment Receipt", "Draft -> Confirmed -> Bounced (optional)", FINANCE_COLOR),
            ("Credit/Debit Note", "Draft -> Approved", FINANCE_COLOR),
            ("Work Order", "Draft -> Approved -> In Production -> Completed -> Closed", MANUFACTURING_COLOR),
            ("Stock Transfer", "Draft -> Confirmed", INVENTORY_COLOR),
            ("Stock Adjustment", "Draft -> Approved", INVENTORY_COLOR),
        ]

        for name, flow, color in flows:
            if not self.check_space(22):
                self.new_page("SEC-14")
            self.draw_rect(MARGIN, self.y - 2, 3, 14, fill=color)
            self.draw_text(name, MARGIN + 10, self.y, 'InstrumentSans-Bold', 8.5, NAVY)
            self.draw_text(flow, MARGIN + 140, self.y, 'GeistMono', 7, CHARCOAL)
            self.y -= 19

        if not self.check_space(160):
            self.new_page("SEC-14")
        self.y -= 10
        self.draw_subsection("Key Service Methods", "14.2")

        methods = [
            ("inventoryService.getStockBalance(companyId, warehouseId, itemId?)",
             "warehouseId comes before itemId"),
            ("vendorBillService.approveVendorBill()",
             "Not updateStatus - specific approval method"),
            ("vendorPaymentService.confirmVendorPayment()",
             "Not confirmPayment"),
            ("PO/vendor bill resolveGst",
             "Requires item_id on each line for GST calc"),
            ("GRN lines",
             "Use received_quantity, accepted_quantity, po_line_id"),
        ]

        for method, note in methods:
            if not self.check_space(30):
                self.new_page("SEC-14")
            self.draw_text(method, MARGIN + 5, self.y, 'GeistMono', 7.5, TEAL)
            self.y -= 13
            self.draw_text(note, MARGIN + 15, self.y, 'CrimsonPro-Italic', 8.5, SLATE)
            self.y -= 16

        if not self.check_space(100):
            self.new_page("SEC-14")
        self.y -= 10
        self.draw_subsection("Important Distinctions", "14.3")
        self.draw_bullet("Items vs Products: Items = raw materials (purchased). Products = finished goods (sold)")
        self.draw_bullet("Products do NOT have item_id - they are separate entities")
        self.draw_bullet("Stock added at GRN confirmation, NOT at PO approval")
        self.draw_bullet("Stock deducted at Delivery Challan confirmation, NOT at Invoice creation")
        self.draw_bullet("SO confirmation reserves stock; Delivery confirmation releases reservation + deducts")
        self.draw_bullet("Vendor addresses: polymorphic table (entity_type='vendor')")
        self.draw_bullet("GST type: compare branch state vs counterparty state")
        self.draw_bullet("All edits restricted to Draft status - confirmed documents are immutable")
        self.draw_bullet("Soft deletes everywhere - is_deleted flag, not physical deletion")

    def page_end(self):
        """Final page"""
        self.c.showPage()
        self.page_num += 1

        # Full navy background
        self.draw_rect(0, 0, W, H, fill=NAVY_DARK)

        # Grid pattern
        self.c.saveState()
        self.c.setStrokeColor(HexColor('#263B6A'))
        self.c.setLineWidth(0.2)
        for i in range(0, int(W), 20):
            self.c.line(i, 0, i, H)
        for i in range(0, int(H), 20):
            self.c.line(0, i, W, i)
        self.c.restoreState()

        # Center content
        self.draw_text("End of Document", W/2, H * 0.55,
                      'InstrumentSans-Bold', 28, WHITE, align='center')
        self.draw_rect(W/2 - 40, H * 0.52, 80, 2, fill=AMBER)
        self.draw_text("ERP System Training Guide v1.0", W/2, H * 0.48,
                      'CrimsonPro-Italic', 12, SLATE_LIGHT, align='center')
        self.draw_text("For internal training purposes", W/2, H * 0.44,
                      'CrimsonPro', 10, SLATE, align='center')

        # Document reference
        self.draw_text("ERP-TRN-001", W/2, H * 0.1,
                      'GeistMono', 8, AMBER_LIGHT, align='center')

    # ═══════════════════════════════════════════════════
    # MAIN GENERATION
    # ═══════════════════════════════════════════════════

    def generate(self):
        """Generate the complete training document"""
        print("Generating cover page...")
        self.page_cover()

        print("Generating table of contents...")
        self.page_toc()

        print("Generating Section 01: System Overview...")
        self.page_system_overview()

        print("Generating Section 02: Initial Setup...")
        self.page_initial_setup()

        print("Generating Section 03: Master Data...")
        self.page_master_data()

        print("Generating Section 04: Purchase Cycle...")
        self.page_purchase_cycle()

        print("Generating Section 05: Sales Cycle...")
        self.page_sales_cycle()

        print("Generating Section 06: Inventory Management...")
        self.page_inventory()

        print("Generating Section 07: Manufacturing...")
        self.page_manufacturing()

        print("Generating Section 08: Accounting & Finance...")
        self.page_accounting()

        print("Generating Section 09: GST & Tax...")
        self.page_gst()

        print("Generating Section 10: Bank & Cash...")
        self.page_bank_management()

        print("Generating Section 11: Reports...")
        self.page_reports()

        print("Generating Section 12: Stock Impact Reference...")
        self.page_stock_reference()

        print("Generating Section 13: Document Sequences...")
        self.page_doc_sequences()

        print("Generating Section 14: Quick Reference...")
        self.page_cheat_sheet()

        print("Generating end page...")
        self.page_end()

        self.save()
        print(f"\nDocument generated successfully! Total pages: {self.page_num}")


if __name__ == "__main__":
    output_path = "/Users/adarshsingh/vscode-projects/inventory-management/erp/ERP_Training_Guide.pdf"
    doc = ERPTrainingDoc(output_path)
    doc.generate()
    print(f"Saved to: {output_path}")
