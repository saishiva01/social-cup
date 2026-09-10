import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { DataState } from '@/components/DataState';
import { Pagination } from '@/components/Pagination';
import { useAuth } from '@/contexts/auth-context';
import { ApiError } from '@/lib/api';
import { formatCents } from '@/lib/format';

const PAGE_SIZE = 20;

/** PRD Module 9 cafe management: list/search/paginate, create a cafe. Editing, payout rate, PIN, and drinks live on CafeDetailPage. */
export function CafesPage() {
  const { api } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'cafes', page, search],
    queryFn: () => api.getCafes({ page, pageSize: PAGE_SIZE, search: search || undefined }),
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">Cafes</h2>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white"
        >
          {showCreate ? 'Cancel' : 'New cafe'}
        </button>
      </div>

      {showCreate && (
        <CreateCafeForm
          onCreated={() => {
            setShowCreate(false);
            void queryClient.invalidateQueries({ queryKey: ['admin', 'cafes'] });
          }}
        />
      )}

      <input
        type="search"
        placeholder="Search by name…"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
        className="mt-4 w-full max-w-sm rounded border border-slate-300 px-3 py-2 text-sm"
      />

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <DataState
          isLoading={isLoading}
          error={error}
          isEmpty={(data?.items.length ?? 0) === 0}
          emptyMessage="No cafes yet."
        >
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Neighborhood</th>
                <th className="px-4 py-2">Featured</th>
                <th className="px-4 py-2">Payout rate</th>
                <th className="px-4 py-2">PIN set</th>
                <th className="px-4 py-2">Drinks</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((cafe) => (
                <tr
                  key={cafe.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-2">
                    <Link
                      to={`/cafes/${cafe.id}`}
                      className="font-medium text-slate-900 underline-offset-2 hover:underline"
                    >
                      {cafe.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{cafe.neighborhood}</td>
                  <td className="px-4 py-2">{cafe.featured ? 'Yes' : '—'}</td>
                  <td className="px-4 py-2">
                    {cafe.payoutRateCents !== null
                      ? `${formatCents(cafe.payoutRateCents)}/credit`
                      : 'Not set'}
                  </td>
                  <td className="px-4 py-2">{cafe.pinIsSet ? 'Yes' : 'Not set'}</td>
                  <td className="px-4 py-2">{cafe.drinkCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        mutation.mutate();
      }}
      className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2"
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
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {mutation.isPending ? 'Creating…' : 'Create cafe'}
        </button>
      </div>
    </form>
  );
}

export function Field({
  label,
  value,
  onChange,
  required,
  type = 'text',
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className ?? ''}`}>
      <span className="font-medium text-slate-700">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />
    </label>
  );
}
