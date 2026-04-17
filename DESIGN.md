# Design System Specification: The Analytical Architect

## 1. Overview & Creative North Star
**North Star: "The Pristine Curator"**
This design system moves beyond the standard "SaaS Dashboard" aesthetic to create an editorialized data experience. It treats information as high-end gallery content—structured, spacious, and deliberate. We reject the "boxed-in" feeling of traditional B2B software in favor of **Open Composition**. 

By utilizing intentional asymmetry and high-contrast typography scales, we guide the user's eye through complex data sets without visual fatigue. The layout should feel like a premium physical publication: breathable, authoritative, and sophisticated.

---

## 2. Color & Tonal Depth
The color strategy is rooted in "Luminous Clarity." We utilize a monochromatic foundation to allow the **Primary Teal (#2dd4bf)** to function as a surgical precision tool for action and insight.

### The "No-Line" Rule
**Explicit Directive:** 1px solid borders are prohibited for sectioning or containment. 
Boundaries must be defined through **Background Color Shifts**. To separate a sidebar from a main content area, transition from `surface` (#f8f9fb) to `surface_container_low` (#f3f4f6). Lines create visual noise; tonal shifts create "zones."

### Surface Hierarchy & Nesting
Treat the UI as a series of stacked, semi-opaque layers. 
- **Base Layer:** `surface_container_lowest` (#ffffff) for the primary workspace.
- **Secondary Layer:** `surface_container_low` (#f3f4f6) for global navigation or utility bars.
- **Active Layer:** `surface_container_high` (#e7e8ea) for nested elements like data filters or hover states.

### The Glass & Gradient Rule
To prevent the UI from feeling "flat," use **Glassmorphism** for floating elements (modals, dropdowns, or tooltips). Apply `surface_container_lowest` at 85% opacity with a `20px` backdrop-blur. 
For primary CTAs and high-level metric summaries, use a **Signature Gradient**: 
*Linear (135deg): `primary` (#006b5f) to `primary_container` (#2dd4bf).* This adds "soul" and depth to key performance indicators.

---

## 3. Typography: Editorial Authority
We use **Inter** not just for legibility, but as a structural element. The scale is exaggerated to create a clear "Information Scents."

*   **Display-LG (3.5rem):** Reserved for singular, high-impact data points (e.g., Total Revenue).
*   **Headline-SM (1.5rem):** Used for section headers. Always paired with generous top-padding to let the "chapter" breathe.
*   **Body-MD (0.875rem):** The workhorse for all data labels. Use `on_surface_variant` (#3c4a46) for secondary metadata to reduce visual weight.
*   **Label-SM (0.6875rem):** All-caps with 0.05em letter-spacing for overline categories.

**The Hierarchy Rule:** Never place two font sizes from the same category next to each other. Contrast is achieved through size jumps (e.g., Headline-SM paired directly with Body-MD), skipping the "Title" levels for a more modern, asymmetrical rhythm.

---

## 4. Elevation & Depth
In this system, "Elevation" is a feeling, not a drop-shadow.

### The Layering Principle
Depth is achieved via **Tonal Stacking**. A card (`surface_container_lowest`) sitting on a background (`surface_container_low`) creates a natural lift. This "Paper-on-Stone" effect is the primary method of organization.

### Ambient Shadows
When a component must float (e.g., a dragged module or a global search bar), use an **Ambient Shadow**:
- `box-shadow: 0 12px 40px rgba(25, 28, 30, 0.06);`
- The shadow color is a 6% opacity version of `on_surface`, ensuring the shadow feels like a natural obstruction of light rather than a gray smudge.

### The "Ghost Border" Fallback
If high-density data requires a container and tonal shifts aren't sufficient, use a **Ghost Border**:
- `border: 1px solid rgba(186, 202, 197, 0.2);` (`outline_variant` at 20% opacity).

---

## 5. Component Guidelines

### Buttons & Actions
- **Primary:** Gradient-fill (`primary` to `primary_container`) with `on_primary` (#ffffff) text. No border. Radius: `0.25rem` (ROUND_FOUR).
- **Secondary:** `surface_container_high` background. Text in `primary`.
- **Tertiary:** Text-only. Use `label-md` weight.

### Data Cards
- **Forbid Divider Lines.** Use 24px or 32px of vertical white space to separate card sections. 
- Header areas should use a slightly different tonal background (`surface_container_low`) than the content area (`surface_container_lowest`) to signify importance.

### Input Fields
- Background: `surface_container_low`. 
- Border: None (Use a 2px bottom-stroke of `primary` only on `:focus`).
- This creates a cleaner, "form-less" look that reduces cognitive load in complex analytics views.

### New Component: The "Insight Chip"
A bespoke component for B2B analytics. A small, non-interactive tag used within charts.
- Background: `secondary_container` (#b5eadf).
- Text: `on_secondary_container` (#396b63).
- Use: To highlight "anomalies" or "peaks" in data visualizations.

---

## 6. Do’s and Don’ts

### Do:
- **Do** embrace "Negative Space." If a dashboard feels empty, add more margin, not more widgets.
- **Do** use `primary` (#006b5f) for text links within data tables to maintain brand continuity.
- **Do** use `surface_bright` for the main background to ensure the "Clean, Bright" user requirement is exceeded.

### Don't:
- **Don't** use pure black (#000000) for text. Use `on_surface` (#191c1e) to maintain a premium, "ink-on-paper" feel.
- **Don't** use standard 8px or 12px border-radii. Stick strictly to the `0.25rem` (ROUND_FOUR) for a sharp, professional, "architectural" edge.
- **Don't** use dividers in lists. Use 12px of padding and a `surface_container_low` hover state to define row boundaries.