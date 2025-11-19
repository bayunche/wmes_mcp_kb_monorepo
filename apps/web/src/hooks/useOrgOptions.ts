import { useCallback, useEffect, useState } from "react";
import { fetchLibraries, fetchTenants } from "../api";

type TenantOption = {
  tenantId: string;
  displayName: string;
  description?: string;
};

type LibraryOption = {
  libraryId: string;
  tenantId?: string;
  displayName: string;
  description?: string;
};

interface OrgOptionsState {
  tenants: TenantOption[];
  libraries: LibraryOption[];
  loading: boolean;
  error: string | null;
}

const orgCache: { tenants: TenantOption[]; libraries: LibraryOption[]; loaded: boolean } = {
  tenants: [],
  libraries: [],
  loaded: false
};

let pendingPromise: Promise<void> | null = null;

async function loadOptions() {
  if (pendingPromise) {
    await pendingPromise;
    return;
  }
  pendingPromise = Promise.all([fetchTenants(), fetchLibraries()])
    .then(([tenantResp, libraryResp]) => {
      orgCache.tenants = tenantResp.items ?? [];
      orgCache.libraries = libraryResp.items ?? [];
      orgCache.loaded = true;
    })
    .finally(() => {
      pendingPromise = null;
    });
  await pendingPromise;
}

export function useOrgOptions(autoRefresh = true) {
  const [state, setState] = useState<OrgOptionsState>({
    tenants: orgCache.loaded ? orgCache.tenants : [],
    libraries: orgCache.loaded ? orgCache.libraries : [],
    loading: !orgCache.loaded && autoRefresh,
    error: null
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      await loadOptions();
      setState({
        tenants: orgCache.tenants,
        libraries: orgCache.libraries,
        loading: false,
        error: null
      });
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false, error: (error as Error).message }));
    }
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      refresh();
    }
  }, [autoRefresh, refresh]);

  return { ...state, refresh };
}
