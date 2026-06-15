-- Add SYSTEM value to MessageType enum (для системных сообщений: закрепление/открепление и т.п.)
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'SYSTEM';
