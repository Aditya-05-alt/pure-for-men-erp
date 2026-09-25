'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  addAdminDealerLocation,
  deleteAdminDealerLocation,
  fetchAdminDealerLocations,
} from '@/lib/api/adminDealers';

export default function DealerLocationsSection({ dealerId, ga4CustomerId }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const canManage =
    Number.isFinite(Number(dealerId)) &&
    Number(dealerId) > 0 &&
    Boolean(String(ga4CustomerId || '').trim());

  const loadLocations = useCallback(async () => {
    if (!canManage) {
      setLocations([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAdminDealerLocations(dealerId);
      setLocations(Array.isArray(result?.locations) ? result.locations : []);
    } catch (err) {
      setError(err?.message || 'Failed to load locations.');
      setLocations([]);
    } finally {
      setLoading(false);
    }
  }, [canManage, dealerId]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const handleAdd = async () => {
    const name = String(newName || '').trim();
    if (!name) {
      setError('Enter a location name.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await addAdminDealerLocation(dealerId, name);
      setNewName('');
      setMessage(`Added "${name}".`);
      await loadLocations();
    } catch (err) {
      setError(err?.message || 'Failed to add location.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (locationId, locationName) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await deleteAdminDealerLocation(dealerId, locationId);
      setMessage(`Removed "${locationName}".`);
      await loadLocations();
    } catch (err) {
      setError(err?.message || 'Failed to remove location.');
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <div className="dealers-locations-block">
        <h3 className="dealers-section-title">Store locations</h3>
        <p className="dealers-modal-hint">
          Save the dealer with a GA4 customer ID first, then add locations for dealers
          showing Unknown in Location Breakdown.
        </p>
      </div>
    );
  }

  return (
    <div className="dealers-locations-block">
      <h3 className="dealers-section-title">Store locations</h3>
      <p className="dealers-modal-hint">
        Add location names for this dealer (<code>{ga4CustomerId}</code>). Independent
        from custom type. With <strong>one</strong> location, Unknown on the donut is
        renamed to that name. Old location logic is unchanged for everyone else.
      </p>

      <div className="dealers-raw-key-row dealers-locations-add-row">
        <input
          type="text"
          className="admin-date-input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Location name (e.g. Main Store, Tyler TX)"
          disabled={saving || loading}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <button
          type="button"
          className="ga4-count-export-btn"
          onClick={handleAdd}
          disabled={saving || loading}
        >
          {saving ? 'Saving…' : 'Add location'}
        </button>
      </div>

      {loading && <p className="dealers-modal-hint">Loading locations…</p>}

      {!loading && locations.length > 0 && (
        <ul className="dealers-locations-list">
          {locations.map((loc) => (
            <li key={loc.id} className="dealers-locations-item">
              <span className="dealers-locations-name">{loc.locationName}</span>
              <button
                type="button"
                className="ga4-count-export-btn dealers-locations-remove"
                onClick={() => handleRemove(loc.id, loc.locationName)}
                disabled={saving}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && locations.length === 0 && (
        <p className="dealers-modal-hint">No locations yet — add names above.</p>
      )}

      {error && <p className="ga4-count-error-text">{error}</p>}
      {message && !error && <p className="dealers-refresh-success">{message}</p>}
    </div>
  );
}
