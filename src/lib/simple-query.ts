import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type QueryOptions<T> = {
  queryKey: unknown[];
  queryFn: () => Promise<T>;
  enabled?: boolean;
};

export type QueryResult<T> = {
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
  refetch: () => Promise<T | undefined>;
};

export function useQuery<T>({ queryKey, queryFn, enabled = true }: QueryOptions<T>): QueryResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const stableKey = useMemo(() => JSON.stringify(queryKey), [queryKey]);
  const fnRef = useRef(queryFn);
  fnRef.current = queryFn;

  const fetchData = useCallback(async () => {
    if (!enabled) {
      return data;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await fnRef.current();
      setData(result);
      setIsLoading(false);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error);
      setIsLoading(false);
      throw error;
    }
  }, [enabled, stableKey]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void fetchData();
  }, [enabled, stableKey, fetchData]);

  return {
    data,
    error,
    isLoading,
    refetch: fetchData
  };
}

type MutationOptions<TData, TVariables> = {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: unknown, variables: TVariables) => void;
};

type MutationResult<TData, TVariables> = {
  mutate: (variables: TVariables) => Promise<TData | void>;
  isPending: boolean;
};

export function useMutation<TData, TVariables = void>({
  mutationFn,
  onSuccess,
  onError
}: MutationOptions<TData, TVariables>): MutationResult<TData, TVariables> {
  const [isPending, setIsPending] = useState(false);
  const fnRef = useRef(mutationFn);
  const successRef = useRef(onSuccess);
  const errorRef = useRef(onError);

  fnRef.current = mutationFn;
  successRef.current = onSuccess;
  errorRef.current = onError;

  const mutate = useCallback(async (variables: TVariables) => {
    setIsPending(true);
    try {
      const result = await fnRef.current(variables);
      successRef.current?.(result, variables);
      setIsPending(false);
      return result;
    } catch (error) {
      errorRef.current?.(error, variables);
      setIsPending(false);
    }
  }, []);

  return { mutate, isPending };
}
