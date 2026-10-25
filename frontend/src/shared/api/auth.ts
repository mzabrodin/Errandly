import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { ApiError, http } from './client';
import type { User } from './types';

export const sessionKey = ['session'] as const;

export function useSession(): UseQueryResult<User | null> {
  return useQuery({
    queryKey: sessionKey,
    queryFn: async () => {
      try {
        return await http.get<User>('/auth/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: Infinity,
  });
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export function useRegister(): UseMutationResult<User, Error, RegisterInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => http.post<User>('/auth/register', input),
    onSuccess: (user) => queryClient.setQueryData(sessionKey, user),
  });
}

export function useLogin(): UseMutationResult<User, Error, { email: string; password: string }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      http.post<User>('/auth/login', input),
    onSuccess: (user) => queryClient.setQueryData(sessionKey, user),
  });
}

export function useLogout(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => http.post<void>('/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(sessionKey, null);
    },
  });
}

export function useForgotPassword(): UseMutationResult<void, Error, string> {
  return useMutation({
    mutationFn: (email: string) => http.post<void>('/auth/forgot-password', { email }),
  });
}

export function useResetPassword(): UseMutationResult<
  void,
  Error,
  { token: string; password: string }
> {
  return useMutation({
    mutationFn: (input: { token: string; password: string }) =>
      http.post<void>('/auth/reset-password', input),
  });
}

export function useVerifyEmail(): UseMutationResult<User, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => http.post<User>('/auth/verify-email', { token }),
    onSuccess: (user) => queryClient.setQueryData(sessionKey, user),
  });
}

export function useResendVerification(): UseMutationResult<void, Error, void> {
  return useMutation({
    mutationFn: () => http.post<void>('/auth/verify-email/resend'),
  });
}

export const googleAuthUrl = `${import.meta.env.VITE_API_URL ?? ''}/api/auth/google`;
