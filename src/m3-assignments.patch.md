# M3 Assignment UI — apply to src/game.html

## 1. After cxLoad(), add:

```js
async function loadAssignments(classId) {
  if (!sb || !authUser) return [];
  try {
    const { data, error } = await sb.from('assignments')
      .select('id, title, mission_ids, due_at')
      .eq('class_id', classId)
      .order('due_at', { ascending: true, nullsFirst: false });
    return error ? [] : (data || []);
  } catch (e) { return []; }
}

async function createAssignment(classId, title, missionIds, dueAt) {
  if (!sb) return { error: { message: 'Not connected' } };
  return sb.from('assignments').insert({
    class_id: classId,
    title: title.trim(),
    mission_ids: missionIds,
    due_at: dueAt || null
  });
}
```

## 2. In openClassroom(), after building `teach`, add assignment section for the first owned class (or all):

Inside the `if (d.isTeacher)` block, after `ownedHtml`, insert:

```js
let assignHtml = '';
if (d.owned.length) {
  const cid = d.owned[0].id;
  const asns = await loadAssignments(cid);
  assignHtml = `<div class="rlabel" style="margin-top:14px">Assignments</div>` +
    (asns.length
      ? asns.map(a => `<div class="cx-item"><div><b>${esc(a.title)}</b><br><span class="cx-dim">${a.due_at ? new Date(a.due_at).toLocaleString() : 'No due date'} · ${(a.mission_ids||[]).length} missions</span></div></div>`).join('')
      : '<p class="cx-dim">No assignments yet.</p>') +
    `<div class="cx-form" style="margin-top:8px">
       <input id="asTitle" type="text" placeholder="Assignment title">
       <input id="asDue" type="datetime-local">
       <input id="asMissions" type="text" placeholder="Mission ids, comma-separated (e.g. 1-1,1-2)">
       <button class="btn primary" id="asCreate" type="button">Assign</button>
     </div>`;
}
teach += assignHtml;
```

## 3. For students, after enrolledHtml, show assignments for each enrolled class:

```js
let studentAsns = '';
for (const e of d.enrolled) {
  const asns = await loadAssignments(e.class_id);
  if (asns.length) {
    studentAsns += `<div class="rlabel" style="margin-top:10px">${esc(e.classes?.name || 'Class')} — assignments</div>` +
      asns.map(a => `<div class="cx-item"><div><b>${esc(a.title)}</b><br><span class="cx-dim">${a.due_at ? new Date(a.due_at).toLocaleString() : 'No due date'}</span></div><button class="btn sm" data-open="${esc((a.mission_ids||[])[0]||'')}">Open</button></div>`).join('');
  }
}
```

Then insert `${studentAsns}` before the Back button.

## 4. Wire the create button (after other listeners):

```js
const asBtn = $('#asCreate');
if (asBtn) asBtn.addEventListener('click', async () => {
  const title = $('#asTitle').value.trim();
  const due = $('#asDue').value || null;
  const mids = $('#asMissions').value.split(',').map(s => s.trim()).filter(Boolean);
  if (!title || !mids.length) { $('#cxErr').hidden = false; $('#cxErr').textContent = 'Title and at least one mission required.'; return; }
  const cid = d.owned[0].id;
  const { error } = await createAssignment(cid, title, mids, due);
  if (error) { $('#cxErr').hidden = false; $('#cxErr').textContent = error.message; return; }
  openClassroom();
});
```

## Done when
- Teacher sees create form and existing assignments for a class they own.
- Student sees assignments and due dates for classes they joined.
- "Open" jumps toward the first assigned mission (wire to existing mission open if desired).
