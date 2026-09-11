import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Coffee, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DataState } from '@/components/DataState';
import { Field } from '@/components/Field';
import { useAuth } from '@/contexts/auth-context';
import { ApiError } from '@/lib/api';
import { formatCents } from '@/lib/format';

/** Cafe edit, payout rate, barista PIN, and drink management (PRD Module 9) — everything Module 9's "Cafe management" and "Menu and pricing" sections ask for, for one cafe. */
export function CafeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { api } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'cafes', id],
    queryFn: () => api.getCafe(id!),
    enabled: !!id,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'cafes', id] });

  return (
    <div>
      <Link
        to="/cafes"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Cafes
      </Link>

      <div className="mt-3">
        <DataState isLoading={isLoading} error={error} isEmpty={false} onRetry={() => void refetch()}>
          {data && (
            <>
              <CafeHero cafe={data.cafe} />

              <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
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
            </>
          )}
        </DataState>
      </div>
    </div>
  );
}

function CafeHero({
  cafe,
}: {
  cafe: { name: string; neighborhood: string; address: string; featured: boolean; photos: string[] };
}) {
  const coverPhoto = cafe.photos[0] ?? null;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card">
      <div className="flex h-40 items-center justify-center bg-slate-100">
        {coverPhoto ? (
          <img src={coverPhoto} alt="" className="h-full w-full object-cover" />
        ) : (
          <Coffee className="h-8 w-8 text-slate-300" aria-hidden />
        )}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-2 p-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900">{cafe.name}</h1>
            {cafe.featured ? <Badge tone="info">Featured</Badge> : null}
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {cafe.neighborhood} · {cafe.address}
          </p>
        </div>
      </div>
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
    <Card title="Cafe details">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          mutation.mutate();
        }}
        className="space-y-3"
      >
        <Field label="Name" value={name} onChange={setName} required />
        <Field label="Perk line" value={perkLine} onChange={setPerkLine} />
        <Field label="Neighborhood" value={neighborhood} onChange={setNeighborhood} required />
        <Field label="Address" value={address} onChange={setAddress} required />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={featured}
            onChange={(event) => setFeatured(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Featured (curated discovery)
        </label>
        {error && (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
          {mutation.isSuccess && <span className="text-sm text-emerald-700">Saved.</span>}
        </div>
      </form>
    </Card>
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
    <Card title="Payout rate">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          mutation.mutate();
        }}
        className="space-y-3"
      >
        <p className="text-xs text-slate-500">
          Dollars Social Cup pays this cafe per credit redeemed — unrelated to the fixed $1/credit
          member price. Snapshotted onto every redemption at the moment it happens; changing it never
          rewrites past redemptions.
        </p>
        {currentCents === null && <Badge tone="warning">Not set — cannot accept redemptions yet</Badge>}
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
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save payout rate'}
          </Button>
          {mutation.isSuccess && (
            <span className="text-sm text-emerald-700">
              Saved {formatCents(mutation.data!.payoutRateCents)}.
            </span>
          )}
        </div>
      </form>
    </Card>
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
    <Card title="Barista PIN" action={pinIsSet ? <Badge tone="success">Set</Badge> : <Badge tone="warning">Not set</Badge>}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setConfirmedVersion(null);
          mutation.mutate();
        }}
        className="space-y-3"
      >
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
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : pinIsSet ? 'Reset PIN' : 'Set PIN'}
          </Button>
          {confirmedVersion !== null && (
            <span className="text-sm text-emerald-700">
              PIN updated (version {confirmedVersion}). Trusted devices signed out.
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}

interface DrinkRow {
  id: string;
  name: string;
  photoUrl?: string | null;
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
    <Card
      title="Drinks"
      action={
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? 'Cancel' : 'Add drink'}
        </Button>
      }
    >
      {showCreate && (
        <div className="mb-4">
          <CreateDrinkForm
            cafeId={cafeId}
            onCreated={() => {
              setShowCreate(false);
              onChanged();
            }}
          />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2">Drink</th>
              <th className="py-2">Retail</th>
              <th className="py-2">Credits</th>
              <th className="py-2">Signature</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {drinks.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">
                  No drinks yet.
                </td>
              </tr>
            )}
            {drinks.map((drink) => (
              <tr key={drink.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100">
                      {drink.photoUrl ? (
                        <img src={drink.photoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Coffee className="h-4 w-4 text-slate-300" aria-hidden />
                      )}
                    </div>
                    <span className="font-medium text-slate-900">{drink.name}</span>
                  </div>
                </td>
                <td className="py-2 text-slate-600">{formatCents(drink.retailPriceCents)}</td>
                <td className="py-2 text-slate-600">{drink.creditPrice}</td>
                <td className="py-2">
                  <button
                    type="button"
                    onClick={() => toggleSignature.mutate(drink)}
                    aria-pressed={drink.signature}
                  >
                    <Badge tone={drink.signature ? 'info' : 'neutral'}>
                      {drink.signature ? 'Signature' : 'Standard'}
                    </Badge>
                  </button>
                </td>
                <td className="py-2">
                  <button
                    type="button"
                    onClick={() => toggleActive.mutate(drink)}
                    aria-pressed={drink.isActive}
                  >
                    <Badge tone={drink.isActive ? 'success' : 'neutral'}>
                      {drink.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
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
      className="grid grid-cols-1 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3"
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
        <Button type="submit" variant="primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Adding…' : 'Add drink'}
        </Button>
      </div>
    </form>
  );
}
