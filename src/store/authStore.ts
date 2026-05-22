import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'react-native-uuid';

export interface User {
  id: string;
  evoId: string;
  password: string;
  accountNumber: string;
  name: string;
  email: string;
  phone: string;
  balance: number;
  createdAt: string;
  identityVerified: boolean;
  kyc: {
    status: 'pending' | 'verified' | 'rejected';
    documentType: string;
    documentNumber: string;
  };
  pin: string;
  twoFAEnabled: boolean;
  referralCode: string;
}

export interface Transaction {
  id: string;
  type: 'transfer' | 'topup' | 'withdraw' | 'bill_payment' | 'loan_payment';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  recipientAccountNumber?: string;
  recipientName?: string;
  status: 'pending' | 'success' | 'failed';
  timestamp: string;
  fee?: number;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  transactions: Transaction[];
  accountCreated: boolean;
  login: (evoId: string, password: string) => Promise<boolean>;
  createAccount: (evoId: string, password: string, name: string, email: string, phone: string) => Promise<User>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<boolean>;
  resetPassword: (evoId: string, newPassword: string) => Promise<boolean>;
  addTransaction: (transaction: Omit<Transaction, 'id'>) => void;
  getTransactions: () => Transaction[];
  deleteTransaction: (transactionId: string) => void;
  deleteAccount: () => Promise<void>;
  transfer: (recipientAccountNumber: string, amount: number, description: string) => Promise<Transaction>;
  topup: (amount: number, method: 'bank_transfer' | 'card') => Promise<Transaction>;
  withdraw: (amount: number) => Promise<Transaction>;
}

const generateBeautifulAccountNumber = (): string => {
  const patterns = [
    '1111222233',
    '2222333344',
    '3333444455',
    '5555666677',
    '7777888899',
    '8888999900',
    '1234567890',
    '9876543210',
    '1357924680',
    '2468101214'
  ];
  
  const randomPattern = patterns[Math.floor(Math.random() * patterns.length)];
  return Math.random() > 0.5 ? randomPattern : Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  transactions: [],
  accountCreated: false,

  login: async (evoId: string, password: string) => {
    try {
      const storedUsers = await AsyncStorage.getItem('evobank_users');
      const users: User[] = storedUsers ? JSON.parse(storedUsers) : [];
      
      const user = users.find(u => u.evoId === evoId && u.password === password);
      
      if (!user) {
        return false;
      }

      set({ user, isAuthenticated: true, accountCreated: true });
      await SecureStore.setItemAsync('evobank_auth_token', `${evoId}_${Date.now()}`);
      
      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  },

  createAccount: async (evoId: string, password: string, name: string, email: string, phone: string) => {
    try {
      const accountNumber = generateBeautifulAccountNumber();
      const referralCode = `EVO${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      
      const newUser: User = {
        id: uuidv4() as string,
        evoId,
        password,
        accountNumber,
        name,
        email,
        phone,
        balance: 0,
        createdAt: new Date().toISOString(),
        identityVerified: false,
        kyc: {
          status: 'pending',
          documentType: '',
          documentNumber: ''
        },
        pin: '',
        twoFAEnabled: false,
        referralCode
      };

      const storedUsers = await AsyncStorage.getItem('evobank_users');
      const users: User[] = storedUsers ? JSON.parse(storedUsers) : [];
      users.push(newUser);
      
      await AsyncStorage.setItem('evobank_users', JSON.stringify(users));
      
      set({ user: newUser, isAuthenticated: true, accountCreated: true });
      
      return newUser;
    } catch (error) {
      console.error('Create account error:', error);
      throw error;
    }
  },

  logout: async () => {
    try {
      await SecureStore.deleteItemAsync('evobank_auth_token');
      set({ user: null, isAuthenticated: false, accountCreated: false });
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  updateProfile: async (updates: Partial<User>) => {
    const { user } = get();
    if (!user) return;

    try {
      const updatedUser = { ...user, ...updates };
      
      const storedUsers = await AsyncStorage.getItem('evobank_users');
      const users: User[] = storedUsers ? JSON.parse(storedUsers) : [];
      const index = users.findIndex(u => u.id === user.id);
      
      if (index !== -1) {
        users[index] = updatedUser;
        await AsyncStorage.setItem('evobank_users', JSON.stringify(users));
        set({ user: updatedUser });
      }
    } catch (error) {
      console.error('Update profile error:', error);
    }
  },

  changePassword: async (oldPassword: string, newPassword: string) => {
    const { user } = get();
    if (!user || user.password !== oldPassword) {
      return false;
    }

    try {
      await get().updateProfile({ password: newPassword });
      return true;
    } catch (error) {
      console.error('Change password error:', error);
      return false;
    }
  },

  resetPassword: async (evoId: string, newPassword: string) => {
    try {
      const storedUsers = await AsyncStorage.getItem('evobank_users');
      const users: User[] = storedUsers ? JSON.parse(storedUsers) : [];
      const userIndex = users.findIndex(u => u.evoId === evoId);
      
      if (userIndex === -1) {
        return false;
      }

      users[userIndex].password = newPassword;
      await AsyncStorage.setItem('evobank_users', JSON.stringify(users));
      
      return true;
    } catch (error) {
      console.error('Reset password error:', error);
      return false;
    }
  },

  addTransaction: (transaction: Omit<Transaction, 'id'>) => {
    const transactionWithId: Transaction = {
      ...transaction,
      id: uuidv4() as string
    };

    set(state => ({
      transactions: [transactionWithId, ...state.transactions]
    }));
  },

  getTransactions: () => {
    return get().transactions;
  },

  deleteTransaction: (transactionId: string) => {
    set(state => ({
      transactions: state.transactions.filter(t => t.id !== transactionId)
    }));
  },

  deleteAccount: async () => {
    const { user } = get();
    if (!user) return;

    try {
      const storedUsers = await AsyncStorage.getItem('evobank_users');
      const users: User[] = storedUsers ? JSON.parse(storedUsers) : [];
      const filteredUsers = users.filter(u => u.id !== user.id);
      
      await AsyncStorage.setItem('evobank_users', JSON.stringify(filteredUsers));
      
      set({ user: null, isAuthenticated: false, transactions: [], accountCreated: false });
    } catch (error) {
      console.error('Delete account error:', error);
    }
  },

  transfer: async (recipientAccountNumber: string, amount: number, description: string) => {
    const { user, addTransaction } = get();
    if (!user) throw new Error('User not authenticated');
    if (amount > user.balance) throw new Error('Saldo tidak cukup');

    const transaction: Omit<Transaction, 'id'> = {
      type: 'transfer',
      amount,
      balanceBefore: user.balance,
      balanceAfter: user.balance - amount,
      description,
      recipientAccountNumber,
      status: 'success',
      timestamp: new Date().toISOString()
    };

    await get().updateProfile({ balance: user.balance - amount });
    addTransaction(transaction);

    return { ...transaction, id: uuidv4() as string };
  },

  topup: async (amount: number, method: 'bank_transfer' | 'card') => {
    const { user, addTransaction } = get();
    if (!user) throw new Error('User not authenticated');

    const transaction: Omit<Transaction, 'id'> = {
      type: 'topup',
      amount,
      balanceBefore: user.balance,
      balanceAfter: user.balance + amount,
      description: `Top-up via ${method}`,
      status: 'success',
      timestamp: new Date().toISOString()
    };

    await get().updateProfile({ balance: user.balance + amount });
    addTransaction(transaction);

    return { ...transaction, id: uuidv4() as string };
  },

  withdraw: async (amount: number) => {
    const { user, addTransaction } = get();
    if (!user) throw new Error('User not authenticated');
    if (amount > user.balance) throw new Error('Saldo tidak cukup');

    const fee = amount * 0.01;
    const transaction: Omit<Transaction, 'id'> = {
      type: 'withdraw',
      amount,
      balanceBefore: user.balance,
      balanceAfter: user.balance - amount - fee,
      description: 'Tarik tunai',
      status: 'success',
      timestamp: new Date().toISOString(),
      fee
    };

    await get().updateProfile({ balance: user.balance - amount - fee });
    addTransaction(transaction);

    return { ...transaction, id: uuidv4() as string };
  }
}));
