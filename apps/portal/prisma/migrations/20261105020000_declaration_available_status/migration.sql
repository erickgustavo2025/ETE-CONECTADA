-- Commit separado da regra que usa o novo valor, conforme o contrato de enum do PostgreSQL.
ALTER TYPE "DeclarationRequestStatus" ADD VALUE 'AVAILABLE';
