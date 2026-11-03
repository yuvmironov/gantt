<script setup>
const projects = ref([]);
const diagrams = ref([]);
const projectId = ref('');
const diagramId = ref('');
const snapshot = ref(null);
const selectedTask = ref(null);
const comments = ref([]);
const commentBody = ref('');
const editingCommentId = ref('');
const editCommentBody = ref('');
const progress = ref(0);
const status = ref('planned');
const savingProgress = ref(false);
const savingTask = ref(false);
const error = ref('');
const loading = ref(true);
const syncConnected = ref(false);
const currentUser = ref(null);
const dependencyForm = reactive({ predecessorId: '', successorId: '', lineStyle: 'solid', arrowShape: 'orthogonal' });
const holidayDate = ref('');
const holidayName = ref('');
const importJob = ref(null);
const importing = ref(false);
const importFormat = ref('json');
const pendingImportFile = ref(null);
const importPreview = ref(null);
const members = ref([]);
const executors = ref([]);
const unreadCount = ref(0);
const selectedIds = ref([]);
const bulkStatus = ref('planned');
const bulkProgress = ref(0);
const filterQuery = ref('');
const filterStatus = ref('');
const assignmentDraft = ref([]);
const assignmentForm = reactive({ role: 'responsible', assigneeType: 'user', assigneeId: '' });
const projectForm = reactive({ name: '', description: '' });
const showProjectForm = ref(false);
const diagramForm = reactive({ name: '', description: '', dayMode: 'working' });
const directionForm = reactive({ name: '' });
const taskForm = reactive({ name: '', directionId: '', parentTaskId: '' });
const moveForm = reactive({ directionId: '', sortOrder: 0 });
const taskEdit = reactive({
  name: '',
  description: '',
  priority: 'medium',
  jiraNumber: '',
  startDate: '',
  endDate: '',
  actualEndDate: '',
  bpFlag: false,
  spFlag: false,
});
const collapsed = ref([]);
const showDependencies = ref(true);
const zoom = ref(1);
const labelWidth = ref(420);
const linkMode = ref(false);
const linkFrom = ref('');
const selectedOwner = ref('');
const dragTaskId = ref('');
const dragOverId = ref('');
const dragOverMode = ref('');
let syncSocket = null;
let syncReconnectTimer = null;
let syncRefreshTimer = null;
let syncReloadTimer = null;
let unreadTimer = null;

function csrfToken() {
  return document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('__Host-csrf='))
    ?.slice('__Host-csrf='.length);
}

async function api(path, options = {}) {
  const headers = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if ((options.method ?? 'GET') !== 'GET') headers['X-CSRF-Token'] = csrfToken() ?? '';
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (response.status === 401 && !path.startsWith('/auth/session')) {
    window.location.assign('/login');
  }
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail ?? response.statusText);
  return response.status === 204 ? null : response.json();
}

function statusLabel(value) {
  return {
    planned: 'Планируется',
    in_progress: 'В работе',
    done: 'Готово',
    blocked: 'Блокировано',
    postponed: 'Отложено',
  }[value] ?? value;
}

async function loadProjectContext() {
  if (!projectId.value) {
    members.value = [];
    diagrams.value = [];
    snapshot.value = null;
    return;
  }
  const [memberResponse, executorResponse] = await Promise.all([
    api(`/projects/${projectId.value}/members?limit=200`).catch(() => ({ items: [] })),
    api('/executors?limit=200').catch(() => ({ items: [] })),
  ]);
  members.value = memberResponse.items ?? [];
  executors.value = executorResponse.items ?? [];
}

async function selectProject() {
  await loadProjectContext();
  await loadDiagrams();
}

async function loadProjects() {
  projects.value = (await api('/projects?limit=200')).items ?? [];
  const query = new URLSearchParams(window.location.search);
  projectId.value = query.get('project') || projects.value[0]?.id || '';
  await loadProjectContext();
  await loadDiagrams(query.get('diagram'));
}

async function loadUnread() {
  try {
    unreadCount.value = (await api('/notifications/unread-count')).count ?? 0;
  } catch {
    unreadCount.value = 0;
  }
}

function focusNewTask() {
  document.querySelector('.manage-card')?.setAttribute('open', '');
  setTimeout(() => document.querySelector('.manage-card input[placeholder="Название задачи"]')?.focus(), 0);
}

async function createProject() {
  if (!projectForm.name.trim()) return;
  try {
    await api('/projects', {
      method: 'POST',
      body: { name: projectForm.name, description: projectForm.description },
    });
    projectForm.name = '';
    projectForm.description = '';
    showProjectForm.value = false;
    await loadProjects();
  } catch (reason) {
    error.value = reason.message;
  }
}

async function loadDiagrams(preferredDiagram) {
  if (!projectId.value) {
    diagrams.value = [];
    diagramId.value = '';
    snapshot.value = null;
    return;
  }
  diagrams.value = (await api(`/projects/${projectId.value}/diagrams?limit=200`)).items ?? [];
  diagramId.value = preferredDiagram || diagrams.value[0]?.id || '';
  await loadSnapshot();
}

async function loadSnapshot(preserveTask = false) {
  const previousId = preserveTask ? selectedTask.value?.id : null;
  snapshot.value = null;
  if (!preserveTask) selectedTask.value = null;
  if (!diagramId.value) return;
  snapshot.value = await api(`/diagrams/${diagramId.value}/snapshot`);
  if (!localStorage.getItem('oati_gantt_label_w_v1')) {
    const longest = Math.max(
      ...(snapshot.value?.tasks ?? []).map((task) => String(task.name ?? '').length),
      30,
    );
    labelWidth.value = Math.min(800, Math.max(420, longest * 7 + 220));
  }
  const fresh = (snapshot.value?.tasks ?? []).find((task) => task.id === previousId);
  if (fresh) selectedTask.value = fresh;
}

function fillAssignments(task) {
  assignmentDraft.value = (task.assignments ?? []).map((item) => ({
    role: item.role,
    assigneeType: item.assigneeType,
    assigneeId: item.assigneeId,
    displayName: item.displayName,
  }));
  assignmentForm.role = 'responsible';
  assignmentForm.assigneeType = 'user';
  assignmentForm.assigneeId = '';
}

function assignmentOptions(type) {
  if (type === 'executor') return executors.value;
  return members.value.map((member) => ({ id: member.userId, displayName: member.user?.displayName || member.user?.email }));
}

function assignmentName(assignment) {
  return (
    assignment.displayName ||
    assignmentOptions(assignment.assigneeType).find((item) => item.id === assignment.assigneeId)?.displayName ||
    assignment.assigneeId
  );
}

function addAssignment() {
  if (!assignmentForm.assigneeId) return;
  const duplicate = assignmentDraft.value.some(
    (item) =>
      item.role === assignmentForm.role &&
      item.assigneeType === assignmentForm.assigneeType &&
      item.assigneeId === assignmentForm.assigneeId,
  );
  if (duplicate) return;
  assignmentDraft.value.push({
    role: assignmentForm.role,
    assigneeType: assignmentForm.assigneeType,
    assigneeId: assignmentForm.assigneeId,
  });
  assignmentForm.assigneeId = '';
}

function removeAssignment(index) {
  assignmentDraft.value.splice(index, 1);
}

async function saveAssignments() {
  if (!selectedTask.value) return;
  try {
    await api(`/tasks/${selectedTask.value.id}/assignments`, {
      method: 'PUT',
      body: {
        assignments: assignmentDraft.value.map((item) => ({
          role: item.role,
          assigneeType: item.assigneeType,
          assigneeId: item.assigneeId,
        })),
        baseRevision: snapshot.value?.currentRevision ?? 0,
      },
    });
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  }
}

async function applyBulk() {
  const tasks = (snapshot.value?.tasks ?? []).filter((task) => selectedIds.value.includes(task.id));
  try {
    for (const task of tasks) {
      await api(`/tasks/${task.id}/progress`, {
        method: 'PATCH',
        body: {
          status: bulkStatus.value,
          progress: Number(bulkProgress.value),
          expectedVersion: task.version,
        },
      });
    }
    selectedIds.value = [];
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  }
}

function fillTaskEdit(task) {
  taskEdit.name = task.name ?? '';
  taskEdit.description = task.description ?? '';
  taskEdit.priority = task.priority ?? 'medium';
  taskEdit.jiraNumber = task.jiraNumber ?? '';
  taskEdit.startDate = task.startDate ? task.startDate.slice(0, 10) : '';
  taskEdit.endDate = task.endDate ? task.endDate.slice(0, 10) : '';
  taskEdit.actualEndDate = task.actualEndDate ? task.actualEndDate.slice(0, 10) : '';
  taskEdit.bpFlag = Boolean(task.bpFlag);
  taskEdit.spFlag = Boolean(task.spFlag);
}

async function selectTask(task) {
  selectedTask.value = task;
  progress.value = Number(task.progress) || 0;
  status.value = task.status ?? 'planned';
  fillTaskEdit(task);
  fillAssignments(task);
  moveForm.directionId = '';
  moveForm.sortOrder = 0;
  comments.value = (await api(`/comments?entityType=task&entityId=${task.id}`)).items ?? [];
}

async function createDiagram() {
  if (!diagramForm.name.trim() || !projectId.value) return;
  try {
    const diagram = await api(`/projects/${projectId.value}/diagrams`, {
      method: 'POST',
      body: {
        name: diagramForm.name,
        description: diagramForm.description,
        dayMode: diagramForm.dayMode,
      },
    });
    diagramForm.name = '';
    diagramForm.description = '';
    await loadDiagrams(diagram.id);
  } catch (reason) {
    error.value = reason.message;
  }
}

async function createDirection() {
  if (!directionForm.name.trim() || !diagramId.value) return;
  try {
    await api(`/diagrams/${diagramId.value}/directions`, {
      method: 'POST',
      body: { name: directionForm.name },
    });
    directionForm.name = '';
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  }
}

async function createTask() {
  if (!taskForm.name.trim() || !taskForm.directionId) return;
  try {
    await api(`/diagrams/${diagramId.value}/tasks`, {
      method: 'POST',
      body: {
        directionId: taskForm.directionId,
        parentTaskId: taskForm.parentTaskId || null,
        name: taskForm.name,
        priority: 'medium',
      },
    });
    taskForm.name = '';
    taskForm.parentTaskId = '';
    await loadSnapshot();
  } catch (reason) {
    error.value = reason.message;
  }
}

async function saveTask() {
  if (!selectedTask.value || !taskEdit.name.trim()) return;
  try {
    await api(`/tasks/${selectedTask.value.id}`, {
      method: 'PATCH',
      body: {
        expectedVersion: selectedTask.value.version,
        baseRevision: snapshot.value?.currentRevision ?? 0,
        name: taskEdit.name,
        description: taskEdit.description,
        priority: taskEdit.priority,
        jiraNumber: taskEdit.jiraNumber,
        startDate: taskEdit.startDate || null,
        endDate: taskEdit.endDate || null,
        actualEndDate: taskEdit.actualEndDate || null,
        bpFlag: taskEdit.bpFlag,
        spFlag: taskEdit.spFlag,
      },
    });
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  }
}

async function deleteTask() {
  if (!selectedTask.value) return;
  if (!window.confirm(`Удалить задачу «${selectedTask.value.name}»?`)) return;
  try {
    await api(
      `/tasks/${selectedTask.value.id}?expectedVersion=${selectedTask.value.version}&baseRevision=${snapshot.value?.currentRevision ?? 0}`,
      { method: 'DELETE' },
    );
    await loadSnapshot();
  } catch (reason) {
    error.value = reason.message;
  }
}

async function saveProgress() {
  if (!selectedTask.value || savingProgress.value) return;
  await nextTick();
  savingProgress.value = true;
  const submittedStatus = status.value;
  const submittedProgress = Number(progress.value);
  try {
    const payload = {
      status: submittedStatus,
      progress: submittedProgress,
    };
    let updated;
    try {
      updated = await api(`/tasks/${selectedTask.value.id}/progress`, {
        method: 'PATCH',
        body: { ...payload, expectedVersion: selectedTask.value.version },
      });
    } catch (reason) {
      if (!String(reason.message).includes('version_conflict')) throw reason;
      await loadSnapshot(true);
      if (!selectedTask.value) throw reason;
      updated = await api(`/tasks/${selectedTask.value.id}/progress`, {
        method: 'PATCH',
        body: { ...payload, expectedVersion: selectedTask.value.version },
      });
    }
    const responseStatus = updated.status ?? 'planned';
    const responseProgress = Number(updated.progress) || 0;
    selectedTask.value = updated;
    if (status.value === submittedStatus) status.value = responseStatus;
    if (Number(progress.value) === submittedProgress) progress.value = responseProgress;
    loadSnapshot(true).catch((reason) => (error.value = reason.message));
  } catch (reason) {
    error.value = reason.message;
  } finally {
    savingProgress.value = false;
  }
}

async function saveTaskAll() {
  if (!selectedTask.value || savingTask.value) return;
  await nextTick();
  savingTask.value = true;
  error.value = '';
  const submitted = {
    status: status.value,
    progress: Number(progress.value),
    assignments: assignmentDraft.value.map((item) => ({
      role: item.role,
      assigneeType: item.assigneeType,
      assigneeId: item.assigneeId,
    })),
  };
  try {
    let task = await api(`/tasks/${selectedTask.value.id}`, {
      method: 'PATCH',
      body: {
        expectedVersion: selectedTask.value.version,
        baseRevision: snapshot.value?.currentRevision ?? 0,
        name: taskEdit.name,
        description: taskEdit.description,
        priority: taskEdit.priority,
        jiraNumber: taskEdit.jiraNumber,
        startDate: taskEdit.startDate || null,
        endDate: taskEdit.endDate || null,
        actualEndDate: taskEdit.actualEndDate || null,
        bpFlag: taskEdit.bpFlag,
        spFlag: taskEdit.spFlag,
      },
    });
    task = await api(`/tasks/${task.id}/progress`, {
      method: 'PATCH',
      body: {
        status: submitted.status,
        progress: submitted.progress,
        expectedVersion: task.version,
      },
    });
    if (moveForm.directionId || Number(moveForm.sortOrder) > 0) {
      task = await api(`/tasks/${task.id}/move`, {
        method: 'POST',
        body: {
          directionId: moveForm.directionId || task.directionId,
          sortOrder: Number(moveForm.sortOrder) || 0,
          expectedVersion: task.version,
          baseRevision: snapshot.value?.currentRevision ?? 0,
        },
      });
    }
    task = await api(`/tasks/${task.id}/assignments`, {
      method: 'PUT',
      body: {
        assignments: submitted.assignments,
        baseRevision: snapshot.value?.currentRevision ?? 0,
      },
    });
    selectedTask.value = task;
    status.value = task.status ?? submitted.status;
    progress.value = Number(task.progress) || submitted.progress;
    moveForm.directionId = '';
    moveForm.sortOrder = 0;
    fillTaskEdit(task);
    fillAssignments(task);
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  } finally {
    savingTask.value = false;
  }
}

async function addComment() {
  if (!selectedTask.value || !commentBody.value.trim()) return;
  const taskId = selectedTask.value.id;
  try {
    await api('/comments', {
      method: 'POST',
      body: {
        entityType: 'task',
        entityId: taskId,
        body: commentBody.value,
      },
    });
    commentBody.value = '';
    comments.value = (await api(`/comments?entityType=task&entityId=${taskId}`)).items ?? [];
  } catch (reason) {
    error.value = reason.message;
  }
}

function startEditComment(comment) {
  editingCommentId.value = comment.id;
  editCommentBody.value = comment.body;
}

async function saveComment(comment) {
  if (!editCommentBody.value.trim()) return;
  try {
    await api(`/comments/${comment.id}`, {
      method: 'PATCH',
      body: { body: editCommentBody.value },
    });
    editingCommentId.value = '';
    comments.value = (
      await api(`/comments?entityType=task&entityId=${selectedTask.value.id}`)
    ).items ?? [];
  } catch (reason) {
    error.value = reason.message;
  }
}

async function deleteComment(commentId) {
  if (!selectedTask.value) return;
  try {
    await api(`/comments/${commentId}`, { method: 'DELETE' });
    comments.value = (
      await api(`/comments?entityType=task&entityId=${selectedTask.value.id}`)
    ).items ?? [];
  } catch (reason) {
    error.value = reason.message;
  }
}

function onTaskDragStart(event, task) {
  dragTaskId.value = task.id;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', task.id);
}

function onTaskDragOver(event, targetRow) {
  if (!dragTaskId.value) return;
  dragOverId.value = targetRow.key;
  if (targetRow.type === 'direction') {
    dragOverMode.value = 'inside';
    return;
  }
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = (event.clientY - rect.top) / rect.height;
  dragOverMode.value = ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'inside';
}

function nextSortOrder(directionId, parentTaskId = null) {
  const siblings = (snapshot.value?.tasks ?? []).filter(
    (task) =>
      task.directionId === directionId &&
      (parentTaskId ? task.parentTaskId === parentTaskId : !task.parentTaskId),
  );
  return Math.max(0, ...siblings.map((task) => Number(task.sortOrder) || 0)) + 1;
}

async function onTaskDrop(event, targetRow) {
  event.preventDefault();
  const taskId = dragTaskId.value || event.dataTransfer.getData('text/plain');
  const mode = dragOverMode.value || 'inside';
  dragTaskId.value = '';
  dragOverId.value = '';
  dragOverMode.value = '';
  if (!taskId || taskId === targetRow.task?.id) return;
  const dragged = (snapshot.value?.tasks ?? []).find((task) => task.id === taskId);
  if (!dragged) return;
  if (targetRow.type === 'direction') {
    await moveTaskTo(
      taskId,
      targetRow.direction.id,
      null,
      nextSortOrder(targetRow.direction.id),
    );
    return;
  }
  const target = targetRow.task;
  const dropAsChild = mode === 'inside' && target.level === 2 && !dragged.childrenCount;
  if (dropAsChild) {
    await moveTaskTo(
      taskId,
      target.directionId,
      target.id,
      nextSortOrder(target.directionId, target.id),
    );
  } else {
    await moveTaskTo(
      taskId,
      target.directionId,
      target.parentTaskId,
      Number(target.sortOrder) + (mode === 'after' ? 1 : 0),
    );
  }
}

async function moveTaskTo(taskId, directionId, parentTaskId, sortOrder = 9999) {
  try {
    await api(`/tasks/${taskId}/move`, {
      method: 'POST',
      body: {
        directionId,
        parentTaskId: parentTaskId || '',
        sortOrder,
        expectedVersion: (snapshot.value?.tasks ?? []).find((task) => task.id === taskId)?.version ?? 0,
        baseRevision: snapshot.value?.currentRevision ?? 0,
      },
    });
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  }
}

async function moveTask() {
  if (!selectedTask.value) return;
  try {
    await api(`/tasks/${selectedTask.value.id}/move`, {
      method: 'POST',
      body: {
        directionId: moveForm.directionId || selectedTask.value.directionId,
        sortOrder: Number(moveForm.sortOrder) || 0,
        expectedVersion: selectedTask.value.version,
        baseRevision: snapshot.value?.currentRevision ?? 0,
      },
    });
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  }
}

function quickProgress() {
  if (!selectedTask.value) return;
  progress.value = Math.min(100, Number(progress.value) + 25);
}

async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  window.location.assign('/login');
}

const projectName = computed(
  () => projects.value.find((project) => project.id === projectId.value)?.name ?? 'Проект',
);

const ganttRows = computed(() => {
  const query = filterQuery.value.trim().toLowerCase();
  const filtering = Boolean(query || filterStatus.value || selectedOwner.value);
  const allTasks = snapshot.value?.tasks ?? [];
  const matches = (task) => {
    const matchesQuery =
      !query ||
      task.name?.toLowerCase().includes(query) ||
      task.wbsCode?.toLowerCase().includes(query);
    const matchesStatus = !filterStatus.value || task.status === filterStatus.value;
    const matchesOwner =
      !selectedOwner.value ||
      (task.assignments ?? []).some(
        (assignment) => assignment.role === 'responsible' && assignment.assigneeId === selectedOwner.value,
      );
    return matchesQuery && matchesStatus && matchesOwner;
  };
  const matched = new Set(allTasks.filter(matches).map((task) => task.id));
  const byId = new Map(allTasks.map((task) => [task.id, task]));
  const context = new Set(matched);
  if (filtering) {
    for (const id of matched) {
      let current = byId.get(id);
      while (current?.parentTaskId) {
        context.add(current.parentTaskId);
        current = byId.get(current.parentTaskId);
      }
    }
  }
  const childrenByParent = new Map();
  for (const task of allTasks) {
    const key = task.parentTaskId ?? '';
    const list = childrenByParent.get(key) ?? [];
    list.push(task);
    childrenByParent.set(key, list);
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
  }
  const rows = [];
  const pushTask = (task, depth) => {
    rows.push({
      key: `task-${task.id}`,
      type: 'task',
      task,
      depth,
      isContext: filtering && !matched.has(task.id),
    });
    if (collapsed.value.includes(task.id)) return;
    for (const child of childrenByParent.get(task.id) ?? []) pushTask(child, depth + 1);
  };
  const directions = snapshot.value?.directions ?? [];
  for (const direction of directions) {
    const roots = (childrenByParent.get('') ?? []).filter((task) => task.directionId === direction.id);
    const visibleRoots = filtering
      ? roots.filter((task) => context.has(task.id))
      : roots;
    if (filtering && !visibleRoots.length) continue;
    rows.push({
      key: `direction-${direction.id}`,
      type: 'direction',
      direction,
      depth: 0,
      tasksCount: roots.reduce((sum, task) => sum + 1 + (childrenByParent.get(task.id)?.length ?? 0), 0),
    });
    if (collapsed.value.includes(direction.id)) continue;
    for (const task of visibleRoots) pushTask(task, 1);
  }
  const ungrouped = (childrenByParent.get('') ?? []).filter(
    (task) => !directions.some((direction) => direction.id === task.directionId),
  );
  const ungroupedVisible = filtering ? ungrouped.filter((task) => context.has(task.id)) : ungrouped;
  if (ungroupedVisible.length) {
    rows.push({
      key: 'direction-ungrouped',
      type: 'direction',
      direction: { name: 'Без направления' },
      depth: 0,
      tasksCount: ungroupedVisible.length,
    });
    for (const task of ungroupedVisible) pushTask(task, 1);
  }
  return rows.map((row, index) => ({ ...row, index }));
});

function toggleCollapse(id) {
  collapsed.value = collapsed.value.includes(id)
    ? collapsed.value.filter((item) => item !== id)
    : [...collapsed.value, id];
  localStorage.setItem('oati_gantt_collapsed_v1', JSON.stringify(collapsed.value));
}

function saveLabelWidth() {
  localStorage.setItem('oati_gantt_label_w_v1', String(labelWidth.value));
}

function taskTooltip(task) {
  const parts = [
    `${task.wbsCode} · ${task.name}`,
    task.description,
    task.startDate || task.endDate
      ? `Срок: ${formatShortDate(task.startDate)} — ${formatShortDate(task.effectiveEndDate ?? task.endDate)} (${task.days ?? 0} дн.)`
      : '',
    task.actualEndDate ? `Факт: ${formatShortDate(task.actualEndDate)}` : '',
    `Статус: ${statusLabel(task.status)} · ${task.progress}% · ${task.priority}`,
    responsibleName(task) ? `Ответственный: ${responsibleName(task)}` : '',
    task.jiraNumber ? `Jira: ${task.jiraNumber}` : '',
    task.isCritical ? 'Критический путь' : task.float != null ? `Резерв: ${task.float} дн.` : '',
    task.commentsCount ? `Комментарии: ${task.commentsCount}` : '',
  ];
  return parts.filter(Boolean).join('\n');
}

function priorityClass(priority) {
  return `priority-${priority || 'medium'}`;
}

function changeZoom(delta) {
  zoom.value = Math.min(2, Math.max(0.5, Number((zoom.value + delta).toFixed(2))));
  localStorage.setItem('oati_gantt_zoom_v1', String(zoom.value));
}

async function pickLink(task) {
  if (!linkFrom.value) {
    linkFrom.value = task.id;
    return;
  }
  if (linkFrom.value === task.id) {
    linkFrom.value = '';
    return;
  }
  try {
    await api(`/diagrams/${diagramId.value}/dependencies`, {
      method: 'POST',
      body: {
        predecessorType: 'task',
        predecessorId: linkFrom.value,
        successorType: 'task',
        successorId: task.id,
      },
    });
    linkFrom.value = '';
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  }
}

async function toggleFlag(task, key) {
  try {
    await api(`/tasks/${task.id}`, {
      method: 'PATCH',
      body: {
        expectedVersion: task.version,
        baseRevision: snapshot.value?.currentRevision ?? 0,
        [key]: !task[key],
      },
    });
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  }
}

function startSubtask(task) {
  taskForm.directionId = task.directionId;
  taskForm.parentTaskId = task.id;
  focusNewTask();
}

function taskFlags(task) {
  return `${task.bpFlag ? 'БП ' : ''}${task.spFlag ? 'СП' : ''}`.trim();
}

function isTaskDoneEarly(task) {
  return Number(task.doneDeltaDays) > 0;
}

const timelineRange = computed(() => {
  const tasks = snapshot.value?.tasks ?? [];
  const dates = tasks
    .flatMap((task) => [task.startDate, task.effectiveEndDate ?? task.endDate])
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value));
  const today = new Date();
  const min = dates.length ? Math.min(...dates, today.getTime()) : today.getTime();
  const max = dates.length ? Math.max(...dates, today.getTime()) : min + 1000 * 60 * 60 * 24 * 30;
  return { min, max: Math.max(max, min + 1000 * 60 * 60 * 24 * 7) };
});

const timelineWeeks = computed(() => {
  const { min, max } = timelineRange.value;
  const span = max - min;
  const bucketCount = 8;
  return Array.from({ length: bucketCount }, (_, index) => {
    const start = new Date(min + (span / bucketCount) * index);
    const end = new Date(min + (span / bucketCount) * (index + 1));
    return {
      label: `${start.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}–${end.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}`,
      left: `${(100 / bucketCount) * index}%`,
      width: `${100 / bucketCount}%`,
    };
  });
});

const todayLeft = computed(() => {
  const { min, max } = timelineRange.value;
  return `${Math.min(100, Math.max(0, ((Date.now() - min) / (max - min)) * 100))}%`;
});

const timelineBars = computed(() => {
  const taskRows = ganttRows.value.filter((row) => row.type === 'task');
  const tasks = taskRows.map((row) => row.task);
  const { min, max } = timelineRange.value;
  const span = Math.max(max - min, 1000 * 60 * 60 * 24);
  return taskRows.map((row) => {
    const { task } = row;
    const start = task.startDate
      ? new Date(task.startDate).getTime()
      : min + (span / Math.max(tasks.length, 1)) * row.index;
    const end = task.effectiveEndDate || task.endDate
      ? new Date(task.effectiveEndDate ?? task.endDate).getTime()
      : start + span / Math.max(tasks.length, 1);
    return {
      task,
      style: {
        top: `${row.index * 38 + 8}px`,
        left: `${Math.min(98, Math.max(0, ((start - min) / span) * 100))}%`,
        width: `${Math.max(4, Math.min(100, ((end - start) / span) * 100))}%`,
      },
    };
  });
});

const directionBars = computed(() => {
  const rows = ganttRows.value.filter((row) => row.type === 'direction');
  const { min, max } = timelineRange.value;
  const span = Math.max(max - min, 1000 * 60 * 60 * 24);
  return rows
    .map((row) => {
      const startValue = row.direction.startDate;
      const endValue = row.direction.endDate;
      if (!startValue || !endValue) return null;
      const start = new Date(startValue).getTime();
      const end = new Date(endValue).getTime();
      if (Number.isNaN(start) || Number.isNaN(end)) return null;
      return {
        direction: row.direction,
        style: {
          top: `${row.index * 38 + 8}px`,
          left: `${Math.min(98, Math.max(0, ((start - min) / span) * 100))}%`,
          width: `${Math.max(4, Math.min(100, ((end - start) / span) * 100))}%`,
        },
      };
    })
    .filter(Boolean);
});

const dependencyLines = computed(() => {
  const bars = new Map(timelineBars.value.map((bar) => [bar.task.id, bar]));
  return (snapshot.value?.dependencies ?? [])
    .map((dependency) => {
      const from = bars.get(dependency.predecessorId);
      const to = bars.get(dependency.successorId);
      if (!from || !to) return null;
      const fromLeft = Number.parseFloat(from.style.left);
      const fromWidth = Number.parseFloat(from.style.width);
      const fromTop = Number.parseFloat(from.style.top) + 14;
      const toLeft = Number.parseFloat(to.style.left);
      const toTop = Number.parseFloat(to.style.top) + 14;
      return {
        id: dependency.id,
        x1: fromLeft + fromWidth,
        y1: fromTop,
        x2: toLeft,
        y2: toTop,
        critical: dependency.isCritical,
        color: dependency.color || '#94a3b8',
        dash: dependency.lineStyle,
      };
    })
    .filter(Boolean);
});

function snapWorkday(value, direction = 1) {
  if (snapshot.value?.diagram?.dayMode !== 'working') return value;
  const holidays = new Set((snapshot.value?.holidays ?? []).map((item) => item.holidayDate));
  const date = new Date(value);
  while (holidays.has(date.toISOString().slice(0, 10)) || [0, 6].includes(date.getUTCDay())) {
    date.setUTCDate(date.getUTCDate() + direction);
  }
  return date.toISOString().slice(0, 10);
}

async function updateTaskDates(task, startDate, endDate) {
  try {
    await api(`/tasks/${task.id}`, {
      method: 'PATCH',
      body: {
        expectedVersion: task.version,
        baseRevision: snapshot.value?.currentRevision ?? 0,
        startDate,
        endDate,
      },
    });
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  }
}

function startBarDrag(event, bar, mode) {
  event.preventDefault();
  event.stopPropagation();
  const container = event.currentTarget.closest('.gantt-canvas');
  if (!container || !bar.task.startDate) return;
  const startX = event.clientX;
  const width = container.getBoundingClientRect().width;
  const { min, max } = timelineRange.value;
  const dayMs = 1000 * 60 * 60 * 24;
  const daysInRange = Math.max(1, (max - min) / dayMs);
  const originalStart = new Date(bar.task.startDate);
  const originalEnd = new Date(bar.task.effectiveEndDate ?? bar.task.endDate ?? bar.task.startDate);
  const onMove = (moveEvent) => {
    const deltaDays = Math.round(((moveEvent.clientX - startX) / width) * daysInRange);
    let start = originalStart;
    let end = originalEnd;
    if (mode === 'move') {
      start = new Date(originalStart.getTime() + deltaDays * dayMs);
      end = new Date(originalEnd.getTime() + deltaDays * dayMs);
    } else if (mode === 'start') {
      start = new Date(originalStart.getTime() + deltaDays * dayMs);
      if (start > end) start = end;
    } else if (mode === 'end') {
      end = new Date(originalEnd.getTime() + deltaDays * dayMs);
      if (end < start) end = start;
    }
    bar.task._dragPreview = {
      start: snapWorkday(start.toISOString().slice(0, 10), 1),
      end: snapWorkday(end.toISOString().slice(0, 10), -1),
    };
  };
  const onUp = async () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    const preview = bar.task._dragPreview;
    delete bar.task._dragPreview;
    if (!preview || (preview.start === bar.task.startDate && preview.end === bar.task.endDate)) return;
    await updateTaskDates(bar.task, preview.start, preview.end);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once: true });
}

function printChart() {
  window.print();
}

async function exportPdf() {
  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);
    const element = document.querySelector('.gantt-frame');
    if (!element) return;
    const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const width = 277;
    const height = (canvas.height * width) / canvas.width;
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, width, Math.min(height, 190));
    pdf.save(`SMART_OATI_диаграмма_Ганта_${new Date().toISOString().slice(0, 10)}.pdf`);
  } catch (reason) {
    error.value = reason.message;
  }
}

function formatShortDate(value) {
  return value ? new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '';
}

function responsibleName(task) {
  const assignment = (task.assignments ?? []).find((item) => item.role === 'responsible');
  return assignment ? assignmentName(assignment) : '';
}

function statusBadgeClass(statusValue) {
  return (
    {
      done: 'badge-success',
      in_progress: 'badge-primary',
      blocked: 'badge-warning',
      postponed: 'badge-warning',
      planned: 'badge-neutral',
    }[statusValue] ?? 'badge-neutral'
  );
}

function initials(user) {
  const name = user?.displayName || user?.firstName || user?.email || '';
  return String(name).slice(0, 2).toUpperCase();
}

function taskLabel(taskId) {
  const task = (snapshot.value?.tasks ?? []).find((item) => item.id === taskId);
  return task ? `${task.wbsCode} ${task.name}` : taskId;
}

async function addDependency() {
  if (!dependencyForm.predecessorId || !dependencyForm.successorId) return;
  if (dependencyForm.predecessorId === dependencyForm.successorId) {
    error.value = 'Нельзя связать задачу с самой собой';
    return;
  }
  try {
    await api(`/diagrams/${diagramId.value}/dependencies`, {
      method: 'POST',
      body: {
        predecessorType: 'task',
        predecessorId: dependencyForm.predecessorId,
        successorType: 'task',
        successorId: dependencyForm.successorId,
        lineStyle: dependencyForm.lineStyle,
        arrowShape: dependencyForm.arrowShape,
      },
    });
    dependencyForm.predecessorId = '';
    dependencyForm.successorId = '';
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  }
}

async function updateDependencyStyle(dependency, patch) {
  try {
    await api(`/dependencies/${dependency.id}`, {
      method: 'PATCH',
      body: { ...patch, baseRevision: snapshot.value?.currentRevision ?? 0 },
    });
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  }
}

async function deleteDependency(dependencyId) {
  try {
    await api(`/dependencies/${dependencyId}`, { method: 'DELETE' });
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  }
}

async function saveHolidays(items) {
  try {
    await api(`/diagrams/${diagramId.value}/holidays`, {
      method: 'PUT',
      body: { items, baseRevision: snapshot.value?.currentRevision ?? 0 },
    });
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  }
}

async function setDayMode(mode) {
  if (!diagramId.value || snapshot.value?.diagram?.dayMode === mode) return;
  try {
    await api(`/diagrams/${diagramId.value}`, {
      method: 'PATCH',
      body: { dayMode: mode, baseRevision: snapshot.value?.currentRevision ?? 0 },
    });
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  }
}

async function addHolidayPreset() {
  const year = new Date().getFullYear();
  const dates = [
    `${year}-01-01`, `${year}-01-02`, `${year}-01-07`, `${year}-01-08`,
    `${year}-02-23`, `${year}-03-08`, `${year}-05-01`, `${year}-05-09`,
    `${year}-06-12`, `${year}-11-04`,
  ];
  const existing = (snapshot.value?.holidays ?? []).map((holiday) => ({
    holidayDate: holiday.holidayDate,
    name: holiday.name ?? '',
  }));
  for (const date of dates) {
    if (!existing.some((holiday) => holiday.holidayDate === date)) {
      existing.push({ holidayDate: date, name: 'Праздник' });
    }
  }
  await saveHolidays(existing);
}

async function addHoliday() {
  if (!holidayDate.value) return;
  const existing = (snapshot.value?.holidays ?? []).map((holiday) => ({
    holidayDate: holiday.holidayDate,
    name: holiday.name ?? '',
  }));
  if (existing.some((holiday) => holiday.holidayDate === holidayDate.value)) return;
  existing.push({ holidayDate: holidayDate.value, name: holidayName.value });
  await saveHolidays(existing);
  holidayDate.value = '';
  holidayName.value = '';
}

async function deleteHoliday(date) {
  const items = (snapshot.value?.holidays ?? [])
    .filter((holiday) => holiday.holidayDate !== date)
    .map((holiday) => ({ holidayDate: holiday.holidayDate, name: holiday.name ?? '' }));
  await saveHolidays(items);
}

async function importFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || !diagramId.value) return;
  pendingImportFile.value = file;
  importPreview.value = null;
  importJob.value = null;
  const text = await file.text();
  if (importFormat.value === 'csv' || file.name.toLowerCase().endsWith('.csv')) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() && !line.startsWith('#'));
    const delimiter = lines[0]?.includes(';') ? ';' : ',';
    const headers = (lines[0] ?? '').split(delimiter).map((value) => value.trim());
    importPreview.value = {
      fileName: file.name,
      format: 'csv',
      rows: Math.max(0, lines.length - 1),
      columns: headers.length,
      warnings: headers.length < 5 ? ['Недостаточно колонок для полного импорта'] : [],
      errors: [],
    };
    await requestServerPreview(file);
    return;
  }
  try {
    const payload = JSON.parse(text);
    const items = Array.isArray(payload.tasks) ? payload.tasks : [];
    const directions = Array.isArray(payload.directions)
      ? payload.directions.length
      : items.filter((item) => Number(item.level) === 1).length;
    const warnings = [];
    if (payload.formatVersion !== 2 && items.some((item) => item.ownerId && !/^[0-9a-f-]{36}$/i.test(item.ownerId))) {
      warnings.push('Локальные исполнители из HTML-файла будут пропущены без сопоставления с сервером');
    }
    if (payload.formatVersion !== 2 && items.some((item) => item.comments?.some((comment) => comment.author))) {
      warnings.push('Авторы комментариев будут заменены текущим пользователем');
    }
    importPreview.value = {
      fileName: file.name,
      format: payload.formatVersion === 2 ? 'server JSON' : 'standalone JSON',
      directions,
      tasks: payload.formatVersion === 2 ? items.length : items.filter((item) => Number(item.level) >= 2).length,
      dependencies:
        payload.dependencies?.length ??
        items.reduce((sum, item) => sum + String(item.dependencies ?? '').split(/[;,]/).filter(Boolean).length, 0),
      holidays: payload.workdays?.holidays?.length ?? payload.holidays?.length ?? 0,
      warnings,
      errors: items.length ? [] : ['В файле не найдено задач'],
    };
    await requestServerPreview(file);
  } catch (reason) {
    importPreview.value = { fileName: file.name, format: 'json', errors: [reason.message], warnings: [] };
  }
}

async function requestServerPreview(file) {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('format', file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json');
    const response = await fetch(
      `/api/v1/diagrams/${diagramId.value}/import?preview=true`,
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken() ?? '' },
        body: formData,
      },
    );
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail ?? response.statusText);
    const job = await response.json();
    const issues = job.report?.issues ?? [];
    const warnings = issues
      .map((issue) => issue.message ?? issue.code)
      .filter(Boolean)
      .slice(0, 20);
    importPreview.value = {
      ...(importPreview.value ?? { fileName: file.name }),
      fileName: file.name,
      directions: job.report?.directionsCount ?? importPreview.value?.directions ?? 0,
      tasks: job.report?.tasksCount ?? importPreview.value?.tasks ?? 0,
      serverValidated: true,
      warnings: [...(importPreview.value?.warnings ?? []), ...warnings],
      errors: job.status === 'failed' ? [job.errorMessage || 'Импорт отклонён сервером'] : [],
    };
  } catch (reason) {
    importPreview.value = {
      ...(importPreview.value ?? { fileName: file.name }),
      serverValidated: false,
      errors: [...(importPreview.value?.errors ?? []), reason.message],
    };
  }
}

async function applyImport() {
  const file = pendingImportFile.value;
  if (!file || !diagramId.value) return;
  importing.value = true;
  importJob.value = null;
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('format', file.name.toLowerCase().endsWith('.csv') ? 'csv' : importFormat.value);
    const response = await fetch(`/api/v1/diagrams/${diagramId.value}/import`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': csrfToken() ?? '' },
      body: formData,
    });
    if (!response.ok) {
      throw new Error((await response.json().catch(() => ({}))).detail ?? response.statusText);
    }
    importJob.value = await response.json();
    pendingImportFile.value = null;
    await pollImport(importJob.value.id);
  } catch (reason) {
    error.value = reason.message;
  } finally {
    importing.value = false;
  }
}

async function pollImport(jobId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    importJob.value = await api(`/import-jobs/${jobId}`);
    if (importJob.value.status === 'completed') {
      await loadSnapshot(true);
      return;
    }
    if (importJob.value.status === 'failed' || importJob.value.status === 'cancelled') return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

function scheduleSnapshotReload() {
  clearTimeout(syncReloadTimer);
  syncReloadTimer = setTimeout(() => {
    if (diagramId.value) loadSnapshot(true).catch((reason) => (error.value = reason.message));
  }, 250);
}

async function connectSync() {
  clearTimeout(syncReconnectTimer);
  clearTimeout(syncRefreshTimer);
  try {
    const issued = await api('/sync/token');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.__SYNC_URL__ || `${protocol}//${window.location.host.replace('app.', 'sync.')}/ws`;
    syncSocket = new WebSocket(`${host}?token=${encodeURIComponent(issued.token)}`);
    syncSocket.addEventListener('open', () => {
      syncConnected.value = true;
    });
    syncSocket.addEventListener('close', () => {
      syncConnected.value = false;
      syncReconnectTimer = setTimeout(connectSync, 3000);
    });
    syncSocket.addEventListener('error', () => {
      syncConnected.value = false;
    });
    syncSocket.addEventListener('message', (message) => {
      let payload;
      try {
        payload = JSON.parse(message.data);
      } catch {
        return;
      }
      if (payload.type !== 'diagram.changed' || !payload.event) return;
      if (payload.event.diagram_id !== diagramId.value) return;
      if (payload.event.actor_user_id && payload.event.actor_user_id === currentUser.value?.id) return;
      loadUnread();
      scheduleSnapshotReload();
    });
    syncRefreshTimer = setTimeout(connectSync, Math.max(60, (issued.expiresIn ?? 300) - 30) * 1000);
  } catch {
    syncConnected.value = false;
    syncReconnectTimer = setTimeout(connectSync, 3000);
  }
}

onUnmounted(() => {
  clearTimeout(syncReconnectTimer);
  clearTimeout(syncRefreshTimer);
  clearTimeout(syncReloadTimer);
  clearInterval(unreadTimer);
  syncSocket?.close();
});

onMounted(async () => {
  try {
    collapsed.value = JSON.parse(localStorage.getItem('oati_gantt_collapsed_v1') || '[]');
    zoom.value = Number(localStorage.getItem('oati_gantt_zoom_v1')) || 1;
    labelWidth.value = Number(localStorage.getItem('oati_gantt_label_w_v1')) || 420;
    const session = await api('/auth/session');
    currentUser.value = session?.user ?? session;
    await loadProjects();
    await loadUnread();
    unreadTimer = setInterval(loadUnread, 60_000);
    await connectSync();
  } catch (reason) {
    error.value = reason.message;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="app-shell gantt-shell">
    <header class="app-header">
      <a class="app-brand" href="/gantt"><span class="brand-mark">▥</span><span>SMART OATI</span></a>
      <nav class="app-nav">
        <a class="active" href="/gantt">Проекты</a>
        <a href="/members">Участники</a>
        <a href="/notifications">Уведомления</a>
        <a href="/profile">Профиль</a>
        <a v-if="currentUser?.globalRoles?.includes('app_admin')" href="/admin">Админка</a>
      </nav>
      <div class="app-header-right">
        <span class="sync-status" :class="{ online: syncConnected }">{{ syncConnected ? 'Синхронизировано' : 'Офлайн' }}</span>
        <a class="header-icon notification-icon" href="/notifications" aria-label="Уведомления">🔔<span v-if="unreadCount" class="notice-dot">{{ unreadCount }}</span></a>
        <div class="user-chip"><span class="avatar">{{ initials(currentUser) || 'СО' }}</span><span>{{ currentUser?.displayName || currentUser?.email || 'Пользователь' }}</span></div>
        <button class="btn btn-ghost btn-sm" type="button" @click="logout">Выйти</button>
      </div>
    </header>

    <main class="page gantt-page">
      <div class="breadcrumbs"><a href="/gantt">Рабочее пространство</a><span class="sep">/</span><span>{{ projectName }}</span><span class="sep">/</span><strong>{{ snapshot?.diagram?.name || 'Gantt' }}</strong></div>

      <div v-if="projects.length" class="project-bar">
        <label>
          <span>Проект</span>
          <select v-model="projectId" class="input" @change="selectProject()">
            <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option>
          </select>
        </label>
        <label v-if="diagrams.length">
          <span>Диаграмма</span>
          <select v-model="diagramId" class="input" @change="loadSnapshot()">
            <option v-for="diagram in diagrams" :key="diagram.id" :value="diagram.id">{{ diagram.name }}</option>
          </select>
        </label>
        <button class="btn btn-secondary btn-sm project-create-toggle" type="button" @click="showProjectForm = !showProjectForm">
          ＋ Новый проект
        </button>
      </div>

      <form v-if="showProjectForm" class="card project-create-form" @submit.prevent="createProject">
        <input v-model="projectForm.name" class="input" placeholder="Название проекта" required />
        <input v-model="projectForm.description" class="input" placeholder="Описание" />
        <button class="btn btn-primary" type="submit">Создать проект</button>
      </form>

      <div v-if="snapshot" class="gantt-topline">
        <div class="gantt-title-row">
          <div>
            <div class="title-line"><h1 class="gantt-title">{{ snapshot.diagram?.name }}</h1><span class="badge badge-primary badge-dot">В работе</span></div>
            <div class="muted small">Ревизия {{ snapshot.currentRevision }} · {{ snapshot.tasks?.length || 0 }} задач · {{ members.length }} участников</div>
          </div>
        </div>
        <div class="gantt-top-actions">
          <span class="sync-state">{{ syncConnected ? 'Синхронизировано' : 'Не синхронизировано' }}</span>
          <a class="btn btn-secondary btn-sm" href="/members">Участники</a>
          <div class="user-chip"><span class="avatar sm">{{ initials(currentUser) || 'СО' }}</span><span>{{ currentUser?.firstName || 'Вы' }}</span></div>
        </div>
      </div>

      <div v-if="snapshot" class="gantt-toolbar">
        <button class="btn btn-primary btn-sm" type="button" @click="focusNewTask">＋ Направление / задача</button>
        <div class="divider"></div>
        <input v-model="filterQuery" class="input toolbar-input" placeholder="Поиск по задаче или WBS" />
        <select v-model="filterStatus" class="input toolbar-input">
          <option value="">Все статусы</option>
          <option value="planned">Планируется</option>
          <option value="in_progress">В работе</option>
          <option value="done">Готово</option>
          <option value="blocked">Блокировано</option>
            <option value="postponed">Отложено</option>
        </select>
        <select v-model="selectedOwner" class="input toolbar-input">
          <option value="">Все ответственные</option>
          <option v-for="member in members" :key="member.userId" :value="member.userId">
            {{ member.user?.displayName || member.user?.email }}
          </option>
        </select>
        <button v-if="filterQuery || filterStatus || selectedOwner" class="gantt-chip" type="button" @click="filterQuery = ''; filterStatus = ''; selectedOwner = ''">Сбросить</button>
        <button class="gantt-chip" :class="{ active: linkMode }" type="button" @click="linkMode = !linkMode; linkFrom = ''">Связать</button>
        <label class="gantt-chip"><input v-model="showDependencies" type="checkbox" /> Стрелки</label>
        <span class="gantt-chip day-mode">
          <button type="button" :class="{ active: snapshot.diagram?.dayMode === 'calendar' }" @click="setDayMode('calendar')">Календарные</button>
          <button type="button" :class="{ active: snapshot.diagram?.dayMode === 'working' }" @click="setDayMode('working')">Рабочие</button>
        </span>
        <button class="gantt-chip" type="button" @click="changeZoom(-0.25)">−</button>
        <span class="gantt-chip">{{ Math.round(zoom * 100) }}%</span>
        <button class="gantt-chip" type="button" @click="changeZoom(0.25)">+</button>
        <input
          v-model.number="labelWidth"
          class="width-range"
          type="range"
          min="360"
          max="800"
          step="20"
          title="Ширина колонки названий"
          @input="saveLabelWidth"
        />
        <button class="gantt-chip" type="button" @click="exportPdf">PDF</button>
        <button class="gantt-chip" type="button" @click="printChart">Печать</button>
        <button class="gantt-chip" type="button" @click="loadSnapshot(true)">Обновить</button>
        <div class="toolbar-spacer"></div>
        <select v-model="bulkStatus" class="input toolbar-input">
          <option value="planned">Планируется</option>
          <option value="in_progress">В работе</option>
          <option value="done">Готово</option>
          <option value="blocked">Блокировано</option>
            <option value="postponed">Отложено</option>
        </select>
        <input v-model.number="bulkProgress" class="input toolbar-input progress-input" type="number" min="0" max="100" step="5" />
        <button class="gantt-chip" type="button" :disabled="!selectedIds.length" @click="applyBulk">Применить к {{ selectedIds.length }}</button>
        <select v-model="importFormat" class="input toolbar-input">
          <option value="json">JSON</option>
          <option value="csv">CSV</option>
        </select>
        <label class="gantt-chip file-chip">Импорт<input type="file" accept=".json,.csv" :disabled="importing" @change="importFile" /></label>
        <a class="gantt-chip" :href="`/api/v1/diagrams/${diagramId}/export?format=json&compat=standalone`">Экспорт JSON</a>
        <a class="gantt-chip" :href="`/api/v1/diagrams/${diagramId}/export?format=csv&compat=standalone`">CSV</a>
      </div>

      <div v-if="snapshot?.schedule" class="summary-cards">
        <div class="summary-card"><span>Готовность</span><strong>{{ snapshot.schedule.overallProgress }}%</strong></div>
        <div class="summary-card"><span>Период</span><strong>{{ formatShortDate(snapshot.schedule.projectStart) }}–{{ formatShortDate(snapshot.schedule.projectEnd) }}</strong></div>
        <div class="summary-card"><span>Длительность</span><strong>{{ snapshot.schedule.durationDays }} дн.</strong></div>
        <div class="summary-card"><span>Критических</span><strong>{{ snapshot.schedule.criticalTaskIds?.length || 0 }}</strong></div>
        <div class="summary-card"><span>Просрочено</span><strong>{{ snapshot.schedule.counts?.overdue || 0 }}</strong></div>
        <div class="summary-card"><span>Досрочно</span><strong>{{ snapshot.schedule.counts?.early || 0 }}</strong></div>
      </div>

      <p v-if="loading" class="muted">Загрузка...</p>
      <p v-if="snapshot?.schedule?.cycles?.length" class="error">Обнаружен цикл зависимостей — проверьте связи.</p>
      <p v-if="error" class="error">{{ error }}</p>

      <section v-if="!loading && !projects.length" class="card empty-project">
        <h2>Создайте первый проект</h2>
        <form class="stack" @submit.prevent="createProject">
          <input v-model="projectForm.name" class="input" placeholder="Название проекта" required />
          <input v-model="projectForm.description" class="input" placeholder="Описание" />
          <button class="btn btn-primary" type="submit">Создать проект</button>
        </form>
      </section>

      <section v-if="!loading && projectId && !snapshot" class="card empty-project">
        <h2>Создайте первую диаграмму</h2>
        <form class="stack" @submit.prevent="createDiagram">
          <input v-model="diagramForm.name" class="input" placeholder="Название диаграммы" required />
          <input v-model="diagramForm.description" class="input" placeholder="Описание" />
          <select v-model="diagramForm.dayMode" class="input">
            <option value="working">Рабочие дни</option>
            <option value="calendar">Календарные дни</option>
          </select>
          <button class="btn btn-primary" type="submit">Создать диаграмму</button>
        </form>
      </section>

      <div v-if="snapshot" class="gantt-frame" :style="{ gridTemplateColumns: `${labelWidth}px minmax(420px, 1fr)` }">
        <div class="gantt-labels">
          <div class="gantt-label-head"><span>Структура работ</span><span class="wbs">WBS</span></div>
          <template v-for="row in ganttRows" :key="row.key">
            <div
              v-if="row.type === 'direction'"
              class="gantt-row-label direction"
              @click="toggleCollapse(row.direction.id)"
              @dragover.prevent="onTaskDragOver($event, row)"
              :class="{ 'drop-inside': dragOverId === row.key && dragOverMode === 'inside' }"
              @drop="onTaskDrop($event, row)"
            >
              <span class="caret">{{ collapsed.includes(row.direction.id) ? '›' : '⌄' }}</span>
              <span class="label-name">{{ row.direction.wbsCode ? `${row.direction.wbsCode}. ` : '' }}{{ row.direction.name }}</span>
              <span class="label-meta">
                <span class="badge badge-dot" :class="statusBadgeClass(row.direction.status)">{{ statusLabel(row.direction.status) }}</span>
                <span class="badge badge-neutral">{{ row.direction.progress ?? 0 }}%</span>
                <span class="badge badge-neutral">{{ row.tasksCount }} задач</span>
              </span>
            </div>
            <div
              v-else
              class="gantt-row-label task"
              :class="{
                selected: selectedTask?.id === row.task.id,
                context: row.isContext,
                'drop-before': dragOverId === row.key && dragOverMode === 'before',
                'drop-after': dragOverId === row.key && dragOverMode === 'after',
                'drop-inside': dragOverId === row.key && dragOverMode === 'inside',
              }"
              :style="{ paddingLeft: `${12 + row.depth * 18}px` }"
              :title="taskTooltip(row.task)"
              draggable="true"
              @dragstart="onTaskDragStart($event, row.task)"
              @dragover.prevent="onTaskDragOver($event, row)"
              @drop.stop="onTaskDrop($event, row)"
              @click="selectTask(row.task)"
            >
              <span
                v-if="row.task.childrenCount"
                class="caret"
                @click.stop="toggleCollapse(row.task.id)"
              >{{ collapsed.includes(row.task.id) ? '›' : '⌄' }}</span>
              <span v-else class="caret">·</span>
              <span class="label-name" @click.stop="selectTask(row.task)">
                {{ row.task.wbsCode }}. {{ row.task.name }}
                <span v-if="row.task.startDate || row.task.endDate" class="row-dates">
                  {{ formatShortDate(row.task.startDate) }}–{{ formatShortDate(row.task.effectiveEndDate ?? row.task.endDate) }}
                </span>
              </span>
              <span class="label-meta">
                <span class="priority-dot" :class="priorityClass(row.task.priority)" :title="row.task.priority"></span>
                <button v-if="row.task.jiraNumber" class="row-chip" type="button">{{ row.task.jiraNumber }}</button>
                <button v-if="row.task.commentsCount" class="row-chip" type="button" @click.stop="selectTask(row.task)">💬 {{ row.task.commentsCount }}</button>
                <button class="row-chip" :class="{ 'flag-on': row.task.bpFlag }" type="button" @click.stop="toggleFlag(row.task, 'bpFlag')">БП</button>
                <button class="row-chip" :class="{ 'flag-on': row.task.spFlag }" type="button" @click.stop="toggleFlag(row.task, 'spFlag')">СП</button>
                <span v-if="responsibleName(row.task)" class="badge badge-neutral">{{ responsibleName(row.task) }}</span>
                <span class="badge badge-dot" :class="statusBadgeClass(row.task.status)">{{ statusLabel(row.task.status) }}</span>
                <span class="badge badge-neutral">{{ row.task.progress }}%</span>
                <span v-if="row.task.autoProgress" class="badge badge-primary" title="Рассчитывается по подзадачам">авто</span>
                <span v-if="isTaskDoneEarly(row.task)" class="badge badge-success">досрочно</span>
                <button v-if="row.depth === 1" class="row-action" type="button" title="Добавить подзадачу" @click.stop="startSubtask(row.task)">＋</button>
                <input v-model="selectedIds" type="checkbox" :value="row.task.id" @click.stop />
              </span>
            </div>
          </template>
        </div>
        <div class="gantt-timeline">
          <div class="gantt-time-head" :style="{ minWidth: `${900 * zoom}px` }">
            <div class="gantt-month">План</div>
            <div
              v-for="week in timelineWeeks"
              :key="week.left"
              class="gantt-week"
              :style="{ left: week.left, width: week.width }"
            >{{ week.label }}</div>
          </div>
          <div class="gantt-canvas" :style="{ minHeight: `${Math.max(320, ganttRows.length * 38 + 24)}px`, minWidth: `${900 * zoom}px` }">
            <span class="gantt-today" :style="{ left: todayLeft }"></span>
            <svg v-if="showDependencies" class="deps-overlay">
              <defs>
                <marker id="dep-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0,0 L7,3.5 L0,7 Z" fill="#94a3b8" />
                </marker>
              </defs>
              <line
                v-for="line in dependencyLines"
                :key="line.id"
                :x1="`${line.x1}%`"
                :y1="`${line.y1}px`"
                :x2="`${line.x2}%`"
                :y2="`${line.y2}px`"
                :stroke="line.critical ? '#dc2626' : line.color"
                :stroke-dasharray="line.dash === 'dashed' ? '6 4' : line.dash === 'dotted' ? '2 4' : ''"
                stroke-width="1.4"
                marker-end="url(#dep-arrow)"
              />
            </svg>
            <div
              v-for="bar in directionBars"
              :key="`direction-bar-${bar.direction.id}`"
              class="gantt-bar direction-bar"
              :class="bar.direction.status"
              :style="bar.style"
            >
              <span class="gantt-bar-label">
                {{ bar.direction.wbsCode ? `${bar.direction.wbsCode}. ` : '' }}{{ bar.direction.name }}
                · {{ bar.direction.progress ?? 0 }}%
              </span>
              <span class="fill" :style="{ width: `${bar.direction.progress ?? 0}%` }"></span>
            </div>
            <div
              v-for="bar in timelineBars"
              :key="bar.task.id"
              class="gantt-bar"
              :class="[bar.task.status, { critical: bar.task.isCritical, context: bar.task.isCritical }]"
              :style="bar.style"
              @pointerdown="startBarDrag($event, bar, 'move')"
              @click="linkMode ? pickLink(bar.task) : selectTask(bar.task)"
            >
              <span class="bar-handle left" @pointerdown.stop="startBarDrag($event, bar, 'start')"></span>
              <span class="bar-handle right" @pointerdown.stop="startBarDrag($event, bar, 'end')"></span>
              <span class="gantt-bar-label">{{ bar.task.wbsCode }} · {{ bar.task.progress }}%</span>
              <span class="fill" :style="{ width: `${bar.task.progress}%` }"></span>
            </div>
          </div>
        </div>
      </div>

      <section v-if="snapshot" class="card manage-card manage">
        <h2>Управление задачами, связями и календарём</h2>
        <div class="manage-grid">
          <div>
            <h3>Новая диаграмма</h3>
            <form class="stack" @submit.prevent="createDiagram">
              <input v-model="diagramForm.name" class="input" placeholder="Название диаграммы" required />
              <input v-model="diagramForm.description" class="input" placeholder="Описание" />
              <select v-model="diagramForm.dayMode" class="input">
                <option value="working">Рабочие дни</option>
                <option value="calendar">Календарные дни</option>
              </select>
              <button class="btn btn-secondary" type="submit">Создать диаграмму</button>
            </form>
            <h3>Новое направление</h3>
            <form class="stack" @submit.prevent="createDirection">
              <input v-model="directionForm.name" class="input" placeholder="Название направления" required />
              <button class="btn btn-secondary" type="submit">Создать направление</button>
            </form>
            <h3>Новая задача</h3>
            <form class="stack" @submit.prevent="createTask">
              <select v-model="taskForm.directionId" class="input task-direction" required>
                <option value="" disabled>Направление</option>
                <option v-for="direction in snapshot.directions" :key="direction.id" :value="direction.id">{{ direction.name }}</option>
              </select>
              <select v-model="taskForm.parentTaskId" class="input">
                <option value="">Верхний уровень</option>
                <option
                  v-for="task in snapshot.tasks.filter((item) => item.level === 2 && item.directionId === taskForm.directionId)"
                  :key="task.id"
                  :value="task.id"
                >{{ task.wbsCode }} {{ task.name }}</option>
              </select>
              <input v-model="taskForm.name" class="input" placeholder="Название задачи" required />
              <button class="btn btn-primary" type="submit">Создать задачу</button>
            </form>
          </div>
          <div>
            <h3>Зависимости</h3>
            <div class="manage-list">
              <div v-for="dependency in snapshot.dependencies" :key="dependency.id" class="manage-item">
                <span>
                  {{ taskLabel(dependency.predecessorId) }} → {{ taskLabel(dependency.successorId) }}
                  <span class="dep-controls">
                    <input
                      type="color"
                      :value="dependency.color || '#94a3b8'"
                      title="Цвет связи"
                      @change="updateDependencyStyle(dependency, { color: $event.target.value })"
                    />
                    <select :value="dependency.lineStyle" @change="updateDependencyStyle(dependency, { lineStyle: $event.target.value })">
                      <option value="solid">Сплошная</option>
                      <option value="dashed">Пунктир</option>
                      <option value="dotted">Точки</option>
                    </select>
                    <select :value="dependency.arrowShape" @change="updateDependencyStyle(dependency, { arrowShape: $event.target.value })">
                      <option value="orthogonal">Ортогональная</option>
                      <option value="straight">Прямая</option>
                      <option value="curved">Изогнутая</option>
                    </select>
                  </span>
                </span>
                <button type="button" class="btn btn-ghost btn-sm" @click="deleteDependency(dependency.id)">Удалить</button>
              </div>
              <p v-if="!snapshot.dependencies?.length" class="muted small">Связей пока нет.</p>
            </div>
            <form class="stack" @submit.prevent="addDependency">
              <select v-model="dependencyForm.predecessorId" class="input dep-predecessor" required>
                <option value="" disabled>Предшественник</option>
                <option v-for="task in snapshot.tasks" :key="task.id" :value="task.id">{{ task.wbsCode }} {{ task.name }}</option>
              </select>
              <select v-model="dependencyForm.successorId" class="input dep-successor" required>
                <option value="" disabled>Последователь</option>
                <option v-for="task in snapshot.tasks" :key="task.id" :value="task.id">{{ task.wbsCode }} {{ task.name }}</option>
              </select>
              <select v-model="dependencyForm.lineStyle" class="input">
                <option value="solid">Сплошная</option>
                <option value="dashed">Пунктир</option>
                <option value="dotted">Точки</option>
              </select>
              <select v-model="dependencyForm.arrowShape" class="input">
                <option value="orthogonal">Ортогональная</option>
                <option value="straight">Прямая</option>
                <option value="curved">Изогнутая</option>
              </select>
              <button class="btn btn-secondary" type="submit">Добавить связь</button>
            </form>
          </div>
          <div>
            <h3>Производственный календарь</h3>
            <div class="manage-list">
              <div v-for="holiday in snapshot.holidays" :key="holiday.id" class="manage-item">
                <span>{{ holiday.holidayDate }} — {{ holiday.name || 'Праздник' }}</span>
                <button type="button" class="btn btn-ghost btn-sm" @click="deleteHoliday(holiday.holidayDate)">Удалить</button>
              </div>
              <p v-if="!snapshot.holidays?.length" class="muted small">Праздников пока нет.</p>
            </div>
            <form class="stack" @submit.prevent="addHoliday">
              <input v-model="holidayDate" class="input" type="date" required />
              <input v-model="holidayName" class="input" placeholder="Название" />
              <button class="btn btn-secondary" type="submit">Добавить праздник</button>
              <button class="btn btn-ghost btn-sm" type="button" @click="addHolidayPreset">Праздники РФ</button>
            </form>
            <div v-if="importPreview" class="import-preview">
              <p class="muted small">{{ importPreview.fileName }} · {{ importPreview.format }}</p>
              <p class="muted small">
                Направления: {{ importPreview.directions ?? 0 }}, задачи: {{ importPreview.tasks ?? importPreview.rows ?? 0 }},
                связи: {{ importPreview.dependencies ?? 0 }}, праздники: {{ importPreview.holidays ?? 0 }}
              </p>
              <p v-for="warning in importPreview.warnings" :key="warning" class="import-warning">⚠ {{ warning }}</p>
              <p v-for="issue in importPreview.errors" :key="issue" class="error">{{ issue }}</p>
              <button
                class="btn btn-primary btn-sm"
                type="button"
                :disabled="importPreview.errors?.length || importing"
                @click="applyImport"
              >Применить импорт</button>
            </div>
            <p v-if="importing" class="muted small">Импорт выполняется...</p>
            <template v-else-if="importJob">
              <p class="muted small">{{ importJob.fileName }}: {{ importJob.status }}</p>
              <p v-if="importJob.report" class="muted small">
                Направления: {{ importJob.report.directionsCount }}, задачи: {{ importJob.report.tasksCount }},
                назначения: {{ importJob.report.assignmentsCount }}.
              </p>
              <p v-if="importJob.report?.issues?.length" class="muted small">
                Замечания: {{ importJob.report.issues.length }}
              </p>
              <p v-if="importJob.errorMessage" class="error">{{ importJob.errorMessage }}</p>
            </template>
          </div>
        </div>
      </section>
    </main>

    <aside v-if="selectedTask" class="gantt-drawer drawer">
      <div class="drawer-head">
        <div><h3>Задача</h3><p class="muted small">{{ selectedTask.wbsCode }}. {{ selectedTask.name }}</p></div>
        <button class="btn btn-icon btn-ghost" type="button" @click="selectedTask = null">✕</button>
      </div>
      <div class="drawer-body">
        <div class="inline">
          <select v-model="status" class="input">
            <option value="planned">Планируется</option>
            <option value="in_progress">В работе</option>
            <option value="done">Готово</option>
            <option value="blocked">Блокировано</option>
            <option value="postponed">Отложено</option>
          </select>
          <input v-model.number="progress" class="input" type="number" min="0" max="100" step="5" />
          <button class="btn btn-secondary btn-sm" type="button" @click="quickProgress">+25%</button>
        </div>
        <div class="stack task-edit">
          <input v-model="taskEdit.name" class="input" placeholder="Название задачи" />
          <textarea v-model="taskEdit.description" class="textarea" rows="2" placeholder="Описание" />
          <select v-model="taskEdit.priority" class="input">
            <option value="low">Низкий приоритет</option>
            <option value="medium">Средний приоритет</option>
            <option value="high">Высокий приоритет</option>
            <option value="critical">Критический</option>
          </select>
          <input v-model="taskEdit.jiraNumber" class="input" placeholder="Jira" />
          <div class="dates"><input v-model="taskEdit.startDate" class="input" type="date" /><input v-model="taskEdit.endDate" class="input" type="date" /></div>
          <label class="field"><span>Факт завершения</span><input v-model="taskEdit.actualEndDate" class="input" type="date" /></label>
          <label class="checkbox-line"><input v-model="taskEdit.bpFlag" type="checkbox" /> БП</label>
          <label class="checkbox-line"><input v-model="taskEdit.spFlag" type="checkbox" /> СП</label>

        </div>
        <h3>Перемещение</h3>
        <div class="stack">
          <select v-model="moveForm.directionId" class="input">
            <option value="">Текущее направление</option>
            <option v-for="direction in snapshot?.directions ?? []" :key="direction.id" :value="direction.id">
              {{ direction.name }}
            </option>
          </select>
          <input v-model.number="moveForm.sortOrder" class="input" type="number" min="0" placeholder="Порядок" />
        </div>
        <h3>Назначения</h3>
        <div class="stack">
          <div class="manage-list">
            <div v-for="(assignment, index) in assignmentDraft" :key="`${assignment.role}-${assignment.assigneeType}-${assignment.assigneeId}`" class="manage-item">
              <span>{{ assignment.role === 'responsible' ? 'Ответственный' : assignment.role === 'executor' ? 'Исполнитель' : 'Соисполнитель' }}: {{ assignmentName(assignment) }}</span>
              <button class="btn btn-ghost btn-sm" type="button" @click="removeAssignment(index)">Удалить</button>
            </div>
            <p v-if="!assignmentDraft.length" class="muted small">Назначений нет.</p>
          </div>
          <select v-model="assignmentForm.role" class="input">
            <option value="responsible">Ответственный</option>
            <option value="executor">Исполнитель</option>
            <option value="co_executor">Соисполнитель</option>
          </select>
          <select v-model="assignmentForm.assigneeType" class="input">
            <option value="user">Пользователь</option>
            <option value="executor">Исполнитель</option>
          </select>
          <select v-model="assignmentForm.assigneeId" class="input">
            <option value="">Выберите</option>
            <option v-for="option in assignmentOptions(assignmentForm.assigneeType)" :key="option.id" :value="option.id">{{ option.displayName }}</option>
          </select>
          <button class="btn btn-secondary" type="button" @click="addAssignment">Добавить назначение</button>
        </div>
        <h3>Комментарии</h3>
        <div class="comments">
          <div v-for="comment in comments" :key="comment.id" class="comment">
            <span class="avatar sm">К</span>
            <div>
              <div class="comment-head"><span class="comment-name">{{ comment.authorUserId }}</span><span class="muted small">{{ formatShortDate(comment.createdAt) }}</span></div>
              <template v-if="editingCommentId === comment.id">
                <textarea v-model="editCommentBody" class="textarea" rows="2" />
                <div class="comment-actions">
                  <button class="link-button" type="button" @click="saveComment(comment)">Сохранить</button>
                  <button class="link-button" type="button" @click="editingCommentId = ''">Отмена</button>
                </div>
              </template>
              <template v-else>
                <p class="comment-text">{{ comment.body }}</p>
                <div class="comment-actions">
                  <button class="link-button" type="button" @click="startEditComment(comment)">Изменить</button>
                  <button class="link-button" type="button" @click="deleteComment(comment.id)">Удалить</button>
                </div>
              </template>
            </div>
          </div>
          <p v-if="!comments.length" class="muted small">Комментариев пока нет.</p>
        </div>
        <form class="comment-form composer" @submit.prevent="addComment">
          <textarea v-model="commentBody" class="textarea" rows="3" placeholder="Написать комментарий..." />
          <div class="composer-footer"><button class="btn btn-primary btn-sm" type="submit">Добавить</button></div>
        </form>
      </div>
      <div class="drawer-footer">
        <button class="btn btn-ghost danger" type="button" @click="deleteTask">Удалить</button>
        <button class="btn btn-primary" type="button" :disabled="savingTask" @click="saveTaskAll">
          {{ savingTask ? 'Сохранение...' : 'Сохранить' }}
        </button>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.gantt-shell { min-height: 100vh; }
.gantt-page { padding-bottom: 120px; }
.gantt-page.has-drawer { padding-right: 420px; }
.brand-mark { display: inline-grid; place-items: center; }
.sync-status { font-size: 12px; color: var(--color-text-muted); }
.sync-status.online { color: var(--color-success); }
.summary-cards { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
.summary-card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 10px 12px; display: grid; gap: 3px; box-shadow: var(--shadow-sm); }
.summary-card span { color: var(--color-text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
.summary-card strong { font-size: 16px; }
.project-bar { display: flex; gap: 14px; flex-wrap: wrap; align-items: end; margin: 0 0 16px; }
.project-create-toggle { margin-bottom: 1px; }
.project-create-form { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
.project-create-form .input { max-width: 280px; }
.toolbar-input { width: 170px; min-height: 32px; padding: 5px 8px; font-size: 12px; }
.progress-input { width: 76px; }
.row-dates { color: var(--color-text-muted); font-size: 10px; margin-left: 6px; }
.notification-icon { position: relative; text-decoration: none; }
.notice-dot { position: absolute; top: -4px; right: -4px; min-width: 15px; height: 15px; padding: 0 4px; border-radius: 999px; background: var(--color-danger); color: #fff; font-size: 9px; display: grid; place-items: center; }
.project-bar label { display: grid; gap: 5px; min-width: 240px; }
.project-bar label span { color: var(--color-text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
.gantt-topline { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; margin-bottom: 18px; }
.gantt-title-row { display: flex; gap: 12px; align-items: center; }
.title-line { display: flex; gap: 10px; align-items: center; }
.gantt-title { margin: 0; font-size: 26px; letter-spacing: -0.02em; }
.gantt-top-actions { display: flex; gap: 10px; align-items: center; }
.small { font-size: 12px; }
.gantt-toolbar { display: flex; gap: 8px; align-items: center; padding: 10px 12px; margin-bottom: 14px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); flex-wrap: wrap; }
.gantt-chip { display: inline-flex; gap: 6px; align-items: center; min-height: 32px; padding: 6px 11px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text); font-size: 12px; cursor: pointer; text-decoration: none; }
.gantt-chip.active { background: var(--color-primary-soft); border-color: #bfdbfe; color: var(--color-primary); }
.file-chip input { display: none; }
.gantt-frame { display: grid; grid-template-columns: minmax(380px, 46%) 1fr; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-sm); }
.gantt-labels { border-right: 1px solid var(--color-border); min-width: 0; }
.gantt-label-head, .gantt-row-label { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 8px; align-items: center; height: 38px; min-height: 38px; max-height: 38px; overflow: hidden; padding: 0 12px; border-bottom: 1px solid var(--color-border); }
.gantt-label-head { height: 56px; min-height: 56px; max-height: 56px; background: var(--color-surface-subtle); color: var(--color-text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
.gantt-label-head .wbs { margin-left: auto; }
.gantt-row-label { cursor: pointer; font-size: 13px; }
.gantt-row-label.direction { background: var(--color-surface-subtle); font-weight: 600; cursor: pointer; }
.gantt-row-label.context { opacity: 0.55; }
.gantt-row-label.drop-before { box-shadow: inset 0 2px 0 var(--color-primary); }
.gantt-row-label.drop-after { box-shadow: inset 0 -2px 0 var(--color-primary); }
.gantt-row-label.drop-inside { background: var(--color-primary-soft); outline: 1px dashed var(--color-primary); outline-offset: -2px; }
.width-range { width: 90px; accent-color: var(--color-primary); }
.row-chip, .row-action { border: 1px solid var(--color-border); background: var(--color-surface); border-radius: 5px; padding: 1px 5px; font-size: 10px; cursor: pointer; }
.row-chip.flag-on { background: #dcfce7; border-color: #86efac; color: #15803d; }
.priority-dot { width: 8px; height: 8px; transform: rotate(45deg); border-radius: 1px; display: inline-block; }
.priority-low { background: #94a3b8; }
.priority-medium { background: #f59e0b; }
.priority-high { background: #f97316; }
.priority-critical { background: #dc2626; }
.row-action { color: var(--color-primary); }
.day-mode { padding: 0; overflow: hidden; }
.day-mode button { border: 0; background: transparent; padding: 5px 8px; font-size: 11px; cursor: pointer; }
.day-mode button.active { background: var(--color-primary); color: #fff; }
.bar-handle { position: absolute; top: 0; bottom: 0; width: 7px; cursor: ew-resize; z-index: 3; }
.bar-handle.left { left: 0; }
.bar-handle.right { right: 0; }
.gantt-bar.direction-bar { background: #334155; border-color: #1e293b; color: #f8fafc; z-index: 3; }
.gantt-bar.direction-bar .fill { background: rgb(255 255 255 / 18%); }
.gantt-bar.direction-bar.done { background: #166534; border-color: #14532d; }
.gantt-bar.direction-bar.blocked { background: #991b1b; border-color: #7f1d1d; }
.gantt-bar.critical { border-width: 2px; border-color: #dc2626; }
.gantt-row-label.task .label-meta { flex-wrap: nowrap; justify-content: flex-end; overflow: hidden; }
.gantt-row-label.direction .caret { color: var(--color-text-muted); }
.gantt-row-label:hover, .gantt-row-label.selected { background: #eff6ff; }
.gantt-row-label .caret { color: var(--color-text-muted); }
.label-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.label-meta { display: flex; gap: 5px; align-items: center; flex-wrap: nowrap; white-space: nowrap; }
.gantt-timeline { min-width: 0; overflow-x: auto; overflow-y: hidden; scrollbar-gutter: stable; }
.gantt-timeline::-webkit-scrollbar { height: 12px; }
.gantt-timeline::-webkit-scrollbar-track { background: var(--color-surface-subtle); border-top: 1px solid var(--color-border); }
.gantt-timeline::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; }
.gantt-timeline::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
.gantt-time-head { display: grid; grid-template-columns: 1.2fr repeat(8, 1fr); height: 56px; min-height: 56px; max-height: 56px; border-bottom: 1px solid var(--color-border); background: var(--color-surface-subtle); font-size: 11px; color: var(--color-text-muted); }
.gantt-time-head > * { display: flex; align-items: center; padding: 0 8px; border-right: 1px solid var(--color-border); }
.deps-overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2; overflow: visible; }
.gantt-canvas { position: relative; background-image: repeating-linear-gradient(to right, transparent 0, transparent calc(14.285% - 1px), var(--color-border) calc(14.285% - 1px), var(--color-border) 14.285%); }
.gantt-today { position: absolute; top: 0; bottom: 0; left: 50%; border-left: 2px solid var(--color-danger); z-index: 1; }
.gantt-bar { position: absolute; height: 28px; border-radius: var(--radius-md); background: #dbeafe; color: #1d4ed8; border: 1px solid #93c5fd; cursor: pointer; overflow: hidden; z-index: 2; }
.gantt-bar .fill { position: absolute; inset: 0 auto 0 0; background: rgb(37 99 235 / 18%); }
.gantt-bar-label { position: relative; z-index: 1; display: block; padding: 5px 8px; font-size: 11px; white-space: nowrap; }
.gantt-bar.done { background: #dcfce7; border-color: #86efac; color: #15803d; }
.gantt-bar.blocked { background: #fee2e2; border-color: #fca5a5; color: #b91c1c; }
.gantt-bar.planned { background: #f1f5f9; border-color: #cbd5e1; color: #64748b; }
.gantt-bar.postponed { background: #ede9fe; border-color: #c4b5fd; color: #6d28d9; }
.manage-card { margin-top: 18px; padding: 14px 18px; }
.manage-card summary { cursor: pointer; font-weight: 600; }
.manage-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; margin-top: 18px; }
.manage-list { display: grid; gap: 8px; }
.import-preview { margin-top: 8px; padding: 8px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-subtle); }
.import-warning { color: #b45309; font-size: 11px; margin: 4px 0; }
.dep-controls { display: flex; gap: 4px; margin-top: 4px; }
.dep-controls select { font-size: 10px; padding: 2px 4px; }
.dep-controls input[type=color] { width: 24px; height: 24px; padding: 0; border: 1px solid var(--color-border); }
.manage-item { display: flex; justify-content: space-between; gap: 8px; padding: 8px; border-radius: var(--radius-md); background: var(--color-surface-subtle); font-size: 12px; }
.stack { display: grid; gap: 8px; margin-top: 8px; }
.dates { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.task-edit { padding-bottom: 12px; border-bottom: 1px solid var(--color-border); }
.danger { color: var(--color-danger); }
.gantt-drawer { position: fixed; top: 0; right: 0; z-index: 30; width: 420px; height: 100vh; display: flex; flex-direction: column; background: var(--color-surface); border-left: 1px solid var(--color-border); box-shadow: -20px 0 60px rgb(15 35 64 / 12%); }
.drawer-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; padding: 18px; border-bottom: 1px solid var(--color-border); }
.drawer-head h3 { margin: 0 0 3px; }
.drawer-body { padding: 18px; overflow: auto; flex: 1; }
.drawer-footer { display: flex; justify-content: space-between; gap: 10px; padding: 14px 18px; border-top: 1px solid var(--color-border); background: var(--color-surface); }
.inline { display: flex; gap: 8px; flex-wrap: wrap; }
.comments { display: grid; gap: 12px; margin-top: 10px; }
.comment { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--color-border); }
.comment-head { display: flex; gap: 8px; align-items: baseline; }
.comment-name { font-size: 12px; font-weight: 600; }
.comment-text { margin: 4px 0 0; font-size: 13px; color: var(--color-text); }
.comment-actions { display: flex; gap: 10px; margin-top: 4px; }
.composer { margin-top: 12px; }
.composer-footer { display: flex; justify-content: flex-end; margin-top: 8px; }
.empty-project { max-width: 440px; margin: 40px auto; }
@media print {
  .app-header, .gantt-toolbar, .project-bar, .gantt-top-actions, .manage-card, .gantt-drawer, .summary-card .muted { display: none !important; }
  .gantt-shell { min-height: 0; }
  .gantt-page { padding: 0; }
  .gantt-frame { box-shadow: none; }
}
@media (max-width: 1180px) {
  .gantt-page.has-drawer { padding-right: 0; }
  .gantt-drawer { position: static; width: auto; height: auto; margin: 16px; }
  .gantt-frame { grid-template-columns: 1fr; }
  .gantt-labels { border-right: 0; }
  .manage-grid { grid-template-columns: 1fr; }
}
</style>
