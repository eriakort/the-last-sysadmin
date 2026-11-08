# M3 — Assignments (mission set + due date)

## Acceptance (from roadmap)
Enrolled students see the assignment and its due date, and open its missions from it.

## Schema
Already in `m1-classroom.sql`:

```sql
assignments (
  id, class_id, title, mission_ids text[], due_at, created_at
)
```

RLS: members can read; staff can create/update/delete.

## UI to add (in classroom panel)

1. **Teacher view** (when `is_teacher` and class is owned):
   - Form: title, due date (datetime-local), multi-select of chapters/missions (from existing MISSIONS / chapter list).
   - Button “Assign” → `supabase.from('assignments').insert({ class_id, title, mission_ids, due_at })`.
   - List existing assignments for the class with title, due date, mission count.

2. **Student view** (enrolled):
   - List assignments for classes the student belongs to.
   - Show title, due date (or “No due date”), and a button “Open missions” that jumps the game to the first assigned mission (or shows a filtered mission list).

## Wiring sketch (classroom.js or inline in game.html)

```js
async function loadAssignments(classId) {
  const { data, error } = await sb.from('assignments')
    .select('id, title, mission_ids, due_at')
    .eq('class_id', classId)
    .order('due_at', { ascending: true });
  return data || [];
}

async function createAssignment(classId, title, missionIds, dueAt) {
  return sb.from('assignments').insert({
    class_id: classId,
    title,
    mission_ids: missionIds,
    due_at: dueAt || null
  });
}
```

## Done when
- Teacher can create an assignment for a class they own.
- Student enrolled in that class sees the assignment and due date.
- Student can open the assigned missions from the assignment.

## Next
M4 (teacher dashboard + auto-grading) will read from `attempts` and compute completion % per assignment.
