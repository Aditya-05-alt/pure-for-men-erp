import { buildExampleCsv } from '@/lib/vdpLogics/fields';

async function parseJson(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Request failed.');
  return json;
}

export async function fetchVdpLogics({ search = '', cms = '', dataSource = '' } = {}) {
  const qs = new URLSearchParams();
  if (search) qs.set('search', search);
  if (cms) qs.set('cms', cms);
  if (dataSource) qs.set('dataSource', dataSource);

  const res = await fetch(`/api/admin/vdp-logics?${qs}`, {
    credentials: 'same-origin',
  });
  return parseJson(res);
}

export async function createVdpLogic(payload) {
  const res = await fetch('/api/admin/vdp-logics', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function updateVdpLogic(id, payload) {
  const res = await fetch(`/api/admin/vdp-logics/${id}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function deleteVdpLogic(id) {
  const res = await fetch(`/api/admin/vdp-logics/${id}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  return parseJson(res);
}

export async function uploadVdpLogicsCsv(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/admin/vdp-logics/upload', {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  });
  return parseJson(res);
}

export function downloadExampleVdpLogicsCsv() {
  const csv = buildExampleCsv();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vdp-logics-example.csv';
  a.click();
  URL.revokeObjectURL(url);
}
