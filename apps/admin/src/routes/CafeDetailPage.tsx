import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Field } from './CafesPage';
import { DataState } from '@/components/DataState';
import { useAuth } from '@/contexts/auth-context';
import { ApiError } from '@/lib/api';
import { formatCents } from '@/lib/format';

/** Cafe edit, payout rate, barista PIN, and drink management (PRD Module 9) — everything Module 9's "Cafe management" and "Menu and pricing" sections ask for, for one cafe. */
export function CafeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { api } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'cafes', id],
    queryFn: () => api.getCafe(id!),
    enabled: !!id,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'cafes', id] });

  return (
    <div>
      <Link to="/cafes" className="text-sm text-slate-500 hover:underline">
        ← Cafes
      </Link>

      <DataState isLoading={isLoading} error={error} isEmpty={false}>
        {data && (
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <CafeEditForm cafeId={id!} cafe={data.cafe} onSaved={invalidate} />
            <div className="space-y-6">
              <PayoutRateForm
                cafeId={id!}
                currentCents={data.payoutRateCents}
                onSaved={invalidate}
              />
              <BaristaPinForm cafeId={id!} pinIsSet={data.pinIsSet} />
            </div>
            <div className="lg:col-span-2">
              <DrinksSection cafeId={id!} drinks={data.drinks} onChanged={invalidate} />
            </div>
          </div>
        )}
      </DataState>
    </div>
  );
}

function CafeEditForm({
  cafeId,
  cafe,
  onSaved,
}: {
  cafeId: string;
  cafe: {
    name: string;
    perkLine: string | null;
    neighborhood: string;
    address: string;
    featured: boolean;
  };
  onSaved: () => void;
}) {
  const { api } = useAuth();
  const [name, setName] = useState(cafe.name);
  const [perkLine, setPerkLine] = useState(cafe.perkLine ?? '');
  const [neighborhood, setNeighborhood] = useState(cafe.neighborhood);
  const [address, setAddress] = useState(cafe.address);
  const [featured, setFeatured] = useState(cafe.featured);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.updateCafe(cafeId, { name, perkLine: perkLine || null, neighborhood, address, featured }),
    onSuccess: onSaved,
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to save'),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        mutation.mutate();
      }}
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <h3 className="text-sm font-semibold text-slate-900">Cafe details</h3>
      <Field label="Name" value={name} onChange={setName} required />
      <Field label="Perk line" value={perkLine} onChange={setPerkLine} />
      <Field label="Neighborhood" value={neighborhood} onChange={setNeighborhood} required />
      <Field label="Address" value={address} onChange={setAddress} required />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={featured}
          onChange={(event) => setFeatured(event.target.checked)}
        />
        Featured (curated discovery)
      </label>
      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {mutation.isPending ? 'Saving…' : 'Save'}
      </button>
      {mutation.isSuccess && <span className="ml-3 text-sm text-emerald-700">Saved.</span>}
    </form>
  );
}

function PayoutRateForm({
  cafeId,
  currentCents,
  onSaved,
}: {
  cafeId: string;
  currentCents: number | null;
  onSaved: () => void;
}) {
  const { api } = useAuth();
  const [dollars, setDollars] = useState(currentCents !== null ? String(currentCents / 100) : '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.setPayoutRate(cafeId, Math.round(Number(dollars) * 100)),
    onSuccess: onSaved,
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to save'),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        mutation.mutate();
      }}
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <h3 className="text-sm font-semibold text-slate-900">Payout rate</h3>
      <p className="text-xs text-slate-500">
        Dollars Social Cup pays this cafe per credit redeemed — unrelated to the fixed $1/credit
        member price. Snapshotted onto every redemption at the moment it happens; changing it never
        rewrites past redemptions.
      </p>
      {currentCents === null && (
        <p className="text-xs font-medium text-amber-700">
          Not set — this cafe cannot accept redemptions yet.
        </p>
      )}
      <Field
        label="Rate ($ per credit)"
        value={dollars}
        onChange={setDollars}
        required
        type="number"
      />
      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {mutation.isPending ? 'Saving…' : 'Save payout rate'}
      </button>
      {mutation.isSuccess && (
        <span className="ml-3 text-sm text-emerald-700">
          Saved {formatCents(mutation.data!.payoutRateCents)}.
        </span>
      )}
    </form>
  );
}

function BaristaPinForm({ cafeId, pinIsSet }: { cafeId: string; pinIsSet: boolean }) {
  const { api } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmedVersion, setConfirmedVersion] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.setBaristaPin(cafeId, pin),
    onSuccess: (result) => {
      setPin('');
      setConfirmedVersion(result.pinVersion);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to save'),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setConfirmedVersion(null);
        mutation.mutate();
      }}
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <h3 className="text-sm font-semibold text-slate-900">Barista PIN</h3>
      <p className="text-xs text-slate-500">
        {pinIsSet
          ? 'Setting a new PIN immediately signs out every trusted device at this cafe.'
          : 'Not set yet — the scan page cannot authenticate until a PIN is set.'}
      </p>
      <Field label="New PIN (4-8 digits)" value={pin} onChange={setPin} required type="password" />
      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {mutation.isPending ? 'Saving…' : pinIsSet ? 'Reset PIN' : 'Set PIN'}
      </button>
      {confirmedVersion !== null && (
        <span className="ml-3 text-sm text-emerald-700">
          PIN updated (version {confirmedVersion}). Trusted devices signed out.
        </span>
      )}
    </form>
  );
}

interface DrinkRow {
  id: string;
  name: string;
  creditPrice: number;
  retailPriceCents: number;
  isActive: boolean;
  signature: boolean;
}

function DrinksSection({
  cafeId,
  drinks,
  onChanged,
}: {
  cafeId: string;
  drinks: DrinkRow[];
  onChanged: () => void;
}) {
  const { api } = useAuth();
  const [showCreate, setShowCreate] = useState(false);

  const toggleActive = useMutation({
    mutationFn: (drink: DrinkRow) => api.updateDrink(drink.id, { isActive: !drink.isActive }),
    onSuccess: onChanged,
  });
  const toggleSignature = useMutation({
    mutationFn: (drink: DrinkRow) => api.updateDrink(drink.id, { signature: !drink.signature }),
    onSuccess: onChanged,
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Drinks</h3>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="rounded border border-slate-300 px-3 py-1 text-sm"
        >
          {showCreate ? 'Cancel' : 'Add drink'}
        </button>
      </div>

      {showCreate && (
        <CreateDrinkForm
          cafeId={cafeId}
          onCreated={() => {
            setShowCreate(false);
            onChanged();
          }}
        />
      )}

      <table className="mt-4 w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-2">Name</th>
            <th className="py-2">Retail</th>
            <th className="py-2">Credits</th>
            <th className="py-2">Signature</th>
            <th className="py-2">Active</th>
          </tr>
        </thead>
        <tbody>
          {drinks.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-slate-500">
                No drinks yet.
              </td>
            </tr>
          )}
          {drinks.map((drink) => (
            <tr key={drink.id} className="border-b border-slate-100 last:border-0">
              <td className="py-2">{drink.name}</td>
              <td className="py-2">{formatCents(drink.retailPriceCents)}</td>
              <td className="py-2">{drink.creditPrice}</td>
              <td className="py-2">
                <button
                  type="button"
                  onClick={() => toggleSignature.mutate(drink)}
                  className="text-xs underline"
                >
                  {drink.signature ? 'Yes' : 'No'}
                </button>
              </td>
              <td className="py-2">
                <button
                  type="button"
                  onClick={() => toggleActive.mutate(drink)}
                  className="text-xs underline"
                >
                  {drink.isActive ? 'Active' : 'Inactive'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateDrinkForm({ cafeId, onCreated }: { cafeId: string; onCreated: () => void }) {
  const { api } = useAuth();
  const [name, setName] = useState('');
  const [retailDollars, setRetailDollars] = useState('');
  const [creditPrice, setCreditPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.createDrink(cafeId, {
        name,
        retailPriceCents: Math.round(Number(retailDollars) * 100),
        creditPrice: Number(creditPrice),
      }),
    onSuccess: onCreated,
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create drink'),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        mutation.mutate();
      }}
      className="mt-3 grid grid-cols-1 gap-3 rounded border border-slate-200 p-3 sm:grid-cols-3"
    >
      <Field label="Name" value={name} onChange={setName} required />
      <Field
        label="Retail price ($)"
        value={retailDollars}
        onChange={setRetailDollars}
        required
        type="number"
      />
      <Field
        label="Credit price"
        value={creditPrice}
        onChange={setCreditPrice}
        required
        type="number"
      />
      {error && (
        <p className="text-sm text-red-700 sm:col-span-3" role="alert">
          {error}
        </p>
      )}
      <div className="sm:col-span-3">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {mutation.isPending ? 'Adding…' : 'Add drink'}
        </button>
      </div>
    </form>
  );
}
