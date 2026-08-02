# StudyOS — IB Study Manager

Responsive React Router frontend for an IB study-planning application. It uses
the Flask/SQLite service in `spback` for student data and the Kimi domestic API
for contextual study coaching.

## Implemented criteria

- Sign up, log in, log out, and password reset flows.
- Student profile with name, IB grade/year, and study goals.
- IB subject management with level, teacher, and target grade.
- Focus timer and manual study-session logging.
- Total study time, weekly averages, task completion, and weak-subject insights.
- Full study-plan create, read, update, delete, and completion workflow.
- Priority-and-deadline optimization for open study plans.
- Monthly Overview calendar with scheduled study blocks and deadline markers.
- Kimi smart scheduling that chooses a free study window before a deadline and
  saves the approved suggestion to the calendar.
- Long-term project mode that turns an IA or other large task into editable,
  measurable, color-coded phases. Phases stay as drafts until the student
  approves them, then appear as multi-day calendar ranges.
- Contextual Kimi conversations that include the student's subjects, goals, and
  current plans. Answers use real SSE streaming, so each new piece appears in
  the chat while Kimi is still writing instead of waiting for the full reply.
- Responsive desktop, tablet, and mobile layouts.

## Local development

Start the Flask backend first:

```bash
cd ../spback
source .venv/bin/activate
python app.py
```

Then start the frontend:

```bash
cd ../studyplanner
npm install
cp .env.example .env
npm run dev
```

Open `http://127.0.0.1:5173`. During development, Vite keeps `/api/chat` and
`/api/schedule` in React Router and forwards the remaining `/api/*` requests to
Flask on port `6000`.

## Kimi configuration

Create a domestic-platform API key at `https://platform.kimi.com` and place it
in the frontend `.env` file:

```env
MOONSHOT_API_KEY=replace_with_your_domestic_moonshot_api_key
MOONSHOT_BASE_URL=https://api.moonshot.cn/v1
MOONSHOT_MODEL=kimi-k2.6
```

The key is loaded only by the React Router server and is never included in the
browser bundle. Kimi scheduling uses a structured, non-thinking response so it
can validate the proposed time block before showing it to the student.

If the Flask service is hosted separately in production, set
`VITE_BACKEND_URL` to its public origin. Leave it blank for same-origin use.

## Verification

```bash
npm run typecheck
npm run build
```
