'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  formatDealersSummary,
  formatReportsSummary,
} from '@/lib/access/userAccess';

const EditIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

async function parseResponse(response) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || 'Request failed.');
  return json;
}

function cloneAccess(access) {
  return {
    role: access?.role === 'user' ? 'user' : 'admin',
    allReports: access?.allReports !== false,
    reportKeys: [...(access?.reportKeys || [])],
    allDealers: access?.allDealers !== false,
    dealerIds: [...(access?.dealerIds || [])],
  };
}

function RoleBadge({ role }) {
  const isAdmin = role !== 'user';
  return (
    <span className={`dealers-badge ${isAdmin ? 'dealers-badge--ok' : 'roles-badge--user'}`}>
      {isAdmin ? 'Admin' : 'User'}
    </span>
  );
}

export default function RolesPanel() {
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await parseResponse(
        await fetch('/api/admin/roles', { credentials: 'same-origin' })
      );
      setUsers(json.users || []);
      setReports(json.reports || []);
      setDealers(json.dealers || []);
    } catch (e) {
      setError(e?.message || 'Failed to load roles.');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) => {
      const hay = [
        user.email,
        user.name,
        user.access?.role,
        user.reportsSummary,
        user.dealersSummary,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [users, search]);

  const hasFilters = Boolean(search.trim());

  const startEdit = (user) => {
    setEditingId(user.id);
    setDraft(cloneAccess(user.access));
    setMessage(null);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const updateDraft = (patch) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const toggleReport = (key) => {
    const current = new Set(draft?.reportKeys || []);
    if (current.has(key)) current.delete(key);
    else current.add(key);
    updateDraft({ reportKeys: [...current] });
  };

  const toggleDealer = (id) => {
    const dealerId = Number(id);
    const current = new Set((draft?.dealerIds || []).map(Number));
    if (current.has(dealerId)) current.delete(dealerId);
    else current.add(dealerId);
    updateDraft({ dealerIds: [...current] });
  };

  const saveRow = async (user) => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const json = await parseResponse(
        await fetch('/api/admin/roles', {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            email: user.email,
            role: draft.role,
            allReports: draft.allReports,
            reportKeys: draft.reportKeys,
            allDealers: draft.allDealers,
            dealerIds: draft.dealerIds,
          }),
        })
      );

      const access = json.access;
      setUsers((current) =>
        current.map((row) =>
          row.id === user.id
            ? {
                ...row,
                access,
                reportsSummary: formatReportsSummary(access, reports),
                dealersSummary: formatDealersSummary(access, dealers),
              }
            : row
        )
      );
      setMessage(`Saved access for ${user.email}.`);
      cancelEdit();
    } catch (e) {
      setError(e?.message || 'Failed to save access.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ga4-count-page vdp-logics-page roles-page">
      <header className="ga4-count-toolbar">
        <h1 className="ga4-count-title">Roles</h1>
        <div className="ga4-count-filters-row vdp-logics-filters">
          <label className="admin-date-field ga4-count-dealer-field vdp-logics-search-field">
            <span className="admin-date-label">Search</span>
            <input
              type="search"
              className="ga4-count-search"
              placeholder="Email, role, reports…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="ga4-count-actions vdp-logics-actions">
          <button
            type="button"
            className="ga4-count-export-btn"
            onClick={load}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </header>

      <p className="ga4-count-meta vdp-logics-example-hint">
        {loading && 'Loading users…'}
        {!loading && error && <span className="ga4-count-error-text">{error}</span>}
        {!loading && !error && message && <span>{message}</span>}
        {!loading && !error && !message && (
          <>
            {hasFilters
              ? `${filteredUsers.length.toLocaleString()} of ${users.length.toLocaleString()} user${users.length === 1 ? '' : 's'}`
              : `${users.length.toLocaleString()} user${users.length === 1 ? '' : 's'}`}{' '}
            · Email · Role · Reports · Dealers · writes <code>smart_user_roles</code>
          </>
        )}
      </p>

      {error && !loading && (
        <div className="ga4-count-alert">
          <p>{error}</p>
          <button type="button" className="ga4-count-retry-btn" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {loading && (
        <div className="ga4-count-skeleton" aria-hidden="true">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="ga4-count-skeleton-row" />
          ))}
        </div>
      )}

      {!loading && !error && users.length > 0 && (
        <div className="ga4-count-scroll vdp-logics-scroll">
          <table className="ga4-count-table vdp-logics-table roles-table-layout">
            <colgroup>
              <col style={{ width: 108 }} />
              <col style={{ width: '26%' }} />
              <col style={{ width: 110 }} />
              <col style={{ width: '22%' }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th className="ga4-count-sticky-col vdp-logics-actions-col">Actions</th>
                <th className="ga4-count-sticky-col ga4-count-client vdp-logics-dealer-col roles-col-email">
                  Email
                </th>
                <th className="roles-col-data roles-col-role">Role</th>
                <th className="roles-col-data roles-col-reports">Reports</th>
                <th className="roles-col-data roles-col-dealers">Dealers</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => {
                  const editing = editingId === user.id && draft;
                  const isUserRole = editing
                    ? draft.role === 'user'
                    : user.access?.role === 'user';

                  return (
                    <tr
                      key={user.id}
                      className={editing ? 'roles-row--editing' : ''}
                    >
                      <td className="ga4-count-sticky-col vdp-logics-actions-col">
                        <div className="vdp-logics-actions-inner dealers-actions-inner">
                          {editing ? (
                            <>
                              <button
                                type="button"
                                className="ga4-count-export-btn roles-save-btn"
                                onClick={() => saveRow(user)}
                                disabled={saving}
                                title="Save"
                              >
                                {saving ? '…' : 'Save'}
                              </button>
                              <button
                                type="button"
                                className="vdp-logics-action-btn vdp-logics-action-btn--icon"
                                onClick={cancelEdit}
                                disabled={saving}
                                aria-label="Cancel"
                                title="Cancel"
                              >
                                ×
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="vdp-logics-action-btn vdp-logics-action-btn--icon"
                              onClick={() => startEdit(user)}
                              disabled={Boolean(editingId)}
                              aria-label={`Edit ${user.email || 'user'}`}
                              title="Edit"
                            >
                              <EditIcon />
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="ga4-count-sticky-col ga4-count-client vdp-logics-dealer-col roles-col-email">
                        <div className="roles-email">{user.email || '—'}</div>
                        {user.name ? (
                          <div className="roles-email-sub">{user.name}</div>
                        ) : null}
                      </td>

                      <td className="ga4-count-cell roles-col-data roles-col-role">
                        {editing ? (
                          <select
                            className="ga4-count-select roles-inline-select"
                            value={draft.role}
                            onChange={(e) => {
                              const role = e.target.value;
                              updateDraft({
                                role,
                                allReports: role === 'admin' ? true : draft.allReports,
                                allDealers: role === 'admin' ? true : draft.allDealers,
                              });
                            }}
                          >
                            <option value="admin">Admin</option>
                            <option value="user">User</option>
                          </select>
                        ) : (
                          <RoleBadge role={user.access?.role} />
                        )}
                      </td>

                      <td className="ga4-count-cell roles-col-data roles-col-reports">
                        {editing && isUserRole ? (
                          <div className="roles-cell-editor">
                            <label className="roles-check roles-check--all">
                              <input
                                type="checkbox"
                                checked={draft.allReports}
                                onChange={(e) =>
                                  updateDraft({ allReports: e.target.checked })
                                }
                              />
                              All reports
                            </label>
                            {!draft.allReports && (
                              <div className="roles-check-list">
                                {reports.map((report) => (
                                  <label key={report.key} className="roles-check">
                                    <input
                                      type="checkbox"
                                      checked={draft.reportKeys.includes(report.key)}
                                      onChange={() => toggleReport(report.key)}
                                    />
                                    {report.label}
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="roles-cell-text">
                            {editing && draft.role === 'admin'
                              ? 'All'
                              : user.reportsSummary || 'All'}
                          </span>
                        )}
                      </td>

                      <td className="ga4-count-cell roles-col-data roles-col-dealers">
                        {editing && isUserRole ? (
                          <div className="roles-cell-editor">
                            <label className="roles-check roles-check--all">
                              <input
                                type="checkbox"
                                checked={draft.allDealers}
                                onChange={(e) =>
                                  updateDraft({ allDealers: e.target.checked })
                                }
                              />
                              All dealers
                            </label>
                            {!draft.allDealers && (
                              <>
                                <span className="roles-selected-count">
                                  {draft.dealerIds.length} dealer
                                  {draft.dealerIds.length === 1 ? '' : 's'} selected
                                </span>
                                <div className="roles-check-list roles-dealer-list">
                                  {dealers.map((dealer) => (
                                    <label key={dealer.id} className="roles-check">
                                      <input
                                        type="checkbox"
                                        checked={draft.dealerIds
                                          .map(Number)
                                          .includes(Number(dealer.id))}
                                        onChange={() => toggleDealer(dealer.id)}
                                      />
                                      {dealer.name}
                                      {dealer.clientId ? ` · ${dealer.clientId}` : ''}
                                    </label>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="roles-cell-text">
                            {editing && draft.role === 'admin'
                              ? 'All'
                              : user.dealersSummary || 'All'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr className="vdp-logics-empty-row">
                  <td colSpan={5} className="vdp-logics-empty-cell">
                    No users match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && users.length === 0 && (
        <p className="ga4-count-meta">
          No Supabase Auth users found. Users appear here after they sign up or are created in Auth.
        </p>
      )}
    </div>
  );
}
