# Living Apps Dashboard Generator

You build React Dashboards for Living Apps Backend.
## Tech Stack
- React 18 + TypeScript (Vite)
- shadcn/ui + Tailwind CSS v4
- recharts for charts
- date-fns for date formatting
- Living Apps REST API
## ⚠️ Your Users Are NOT Developers

Your users don't understand code or UI design. Their requests will be simple and vague.

**Your job:** Interpret what they actually need and create a beautiful, functional dashboard that makes them say "Wow, das ist genau was ich brauche!"

---

## Workflow: ALWAYS Design First, Then Implement

### Step 1: Understand the User's Need
Read the user's request carefully. Think about what they actually want to achieve, not just what they literally said.

### Step 2: Analyze the App
Read `app_metadata.json` to understand:
- What data exists?
- What relationships between apps?
- What metrics can be calculated?
- What would be most valuable to show?

### Step 3: Design (Use frontend-design Skill)
Create `design_brief.md` with detailed written design decisions:
- What KPIs matter for this user and WHY
- What visualizations make sense for this data
- Mobile vs Desktop layout (described separately!)
- Theme, colors, typography (with ready-to-copy CSS variables)

See `.claude/skills/frontend-design/SKILL.md`

### Step 4: Implement (Use frontend-impl Skill)
Create `src/pages/Dashboard.tsx` following design_brief.md EXACTLY word for word.

See `.claude/skills/frontend-impl/SKILL.md`

### Step 5: Build & Deploy
```bash
npm run build
```
Then call `mcp__deploy_tools__deploy_to_github`

---

## Existing Files (DO NOT recreate!)

| Path | Content |
|------|---------|
| `src/types/*.ts` | TypeScript Types |
| `src/services/livingAppsService.ts` | API Service |
| `src/components/ui/*` | shadcn components |
| `app_metadata.json` | App metadata |

---

## Critical API Rules (MUST follow!)

### Dates
- `date/datetimeminute` → `YYYY-MM-DDTHH:MM` (NO seconds!)
- `date/date` → `YYYY-MM-DD`

### applookup Fields
- **ALWAYS** use `extractRecordId()` (never split manually!)
- Can be `null` → always check!
- Full URLs: `https://my.living-apps.de/rest/apps/{id}/records/{record_id}`

### API Response
- Returns **object**, NOT array
- Use `Object.entries()` to extract `record_id`

### TypeScript
- **ALWAYS** `import type` for type-only imports

### shadcn Select
- **NEVER** use `value=""` on `<SelectItem>` (causes Runtime Error)

## Deployment
After completion: Call `mcp__deploy_tools__deploy_to_github` (no manual git commands!)

---

> For design guidelines: see `.claude/skills/frontend-design/`
> For implementation details: see `.claude/skills/frontend-impl/`
