import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DataState } from '@/components/DataState';
import { Field } from '@/components/Field';
import { Pagination } from '@/components/Pagination';
import { useAuth } from '@/contexts/auth-context';
import { ApiError } from '@/lib/api';
import { formatCents } from '@/lib/format';

const PAGE_SIZE = 20;

/**
 * PRD Module 9 cafe management: list/search/paginate, create a cafe.
 * Editing, payout rate, PIN, and drinks live on CafeDetailPage. This stays
 * a table rather than a photo grid — `AdminCafeListItem` has no photo field
 * (only the detail response does), and adding one would be an API contract
 * change, out of scope for a visual-only pass.
 */
export function CafesPage() {
  const { api } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'cafes', page, search],
    queryFn: () => api.getCafes({ page, pageSize: PAGE_SIZE, search: search || undefined }),
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Cafes</h1>
          <p className="mt-1 text-sm text-slate-500">Partner cafes, payout rates, and menus.</p>
        </div>
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Cancel' : 'New cafe'}
        </Button>
      </div>

      {showCreate && (
        <div className="mt-4">
          <CreateCafeForm
            onCreated={() => {
              setShowCreate(false);
              void queryClient.invalidateQueries({ queryKey: ['admin', 'cafes'] });
            }}
          />
        </div>
      )}

      <div className="relative mt-5 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          type="search"
          placeholder="Search by name…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card">
        <DataState
          isLoading={isLoading}
          error={error}
          isEmpty={(data?.items.length ?? 0) === 0}
          emptyMessage="No cafes yet."
          onRetry={() => void refetch()}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Neighborhood</th>
                  <th className="px-4 py-2.5">Featured</th>
                  <th className="px-4 py-2.5">Payout rate</th>
                  <th className="px-4 py-2.5">PIN</th>
                  <th className="px-4 py-2.5">Drinks</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((cafe) => (
                  <tr
                    key={cafe.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/cafes/${cafe.id}`}
                        className="font-medium text-slate-900 underline-offset-2 hover:underline"
                      >
                        {cafe.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{cafe.neighborhood}</td>
                    <td className="px-4 py-2.5">
                      {cafe.featured ? (
                        <Badge tone="info">Featured</Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {cafe.payoutRateCents !== null ? (
                        `${formatCents(cafe.payoutRateCents)}/credit`
                      ) : (
                        <Badge tone="warning">Not set</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {cafe.pinIsSet ? (
                        <Badge tone="success">Set</Badge>
                      ) : (
                        <Badge tone="warning">Not set</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{cafe.drinkCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && (
            <Pagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
          )}
        </DataState>
      </div>
    </div>
  );
}

function CreateCafeForm({ onCreated }: { onCreated: () => void }) {
  const { api } = useAuth();
  const [name, setName] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.createCafe({
        name,
        neighborhood,
        address,
        latitude: Number(latitude),
        longitude: Number(longitude),
      }),
    onSuccess: onCreated,
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create cafe'),
  });

  return (
    <Card title="New cafe">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          mutation.mutate();
        }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <Field label="Name" value={name} onChange={setName} required />
        <Field label="Neighborhood" value={neighborhood} onChange={setNeighborhood} required />
        <Field
          label="Address"
          value={address}
          onChange={setAddress}
          required
          className="sm:col-span-2"
        />
        <Field label="Latitude" value={latitude} onChange={setLatitude} required type="number" />
        <Field label="Longitude" value={longitude} onChange={setLongitude} required type="number" />
        {error && (
          <p className="text-sm text-red-700 sm:col-span-2" role="alert">
            {error}
          </p>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create cafe'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
