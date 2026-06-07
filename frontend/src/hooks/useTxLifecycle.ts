'use client';

import { useState } from 'react';
import { ethers } from 'ethers';

export type TxStep =
  | 'IDLE'
  | 'SUBMITTING'           // Requesting approval in user's wallet
  | 'BROADCASTED_PENDING'  // Transaction sent to blockchain, awaiting block confirmation
  | 'BLOCK_CONFIRMED'      // Confirmed on chain
  | 'SUCCESS'
  | 'FAILED';

export function useTxLifecycle() {
  const [txStep, setTxStep] = useState<TxStep>('IDLE');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const executeTx = async (
    txPromise: () => Promise<ethers.TransactionResponse>,
    onConfirmationSuccess?: (receipt: ethers.TransactionReceipt) => void | Promise<void>
  ) => {
    setTxStep('SUBMITTING');
    setErrorMsg(null);
    setTxHash(null);

    try {
      // 1. Prompt user's wallet to sign and broadcast the transaction
      const tx = await txPromise();
      
      // 2. Broadcasted to network, waiting for block inclusion
      setTxStep('BROADCASTED_PENDING');
      setTxHash(tx.hash);

      // 3. Wait for 1 confirmation on-chain
      const receipt = await tx.wait(1);
      
      if (!receipt || receipt.status === 0) {
        throw new Error("Transaction was reverted on-chain. Please verify details.");
      }
      
      setTxStep('BLOCK_CONFIRMED');
      
      if (onConfirmationSuccess) {
        await onConfirmationSuccess(receipt);
      }
      
      setTxStep('SUCCESS');
    } catch (err: any) {
      console.error('Transaction Error:', err);
      setTxStep('FAILED');
      
      // Attempt to retrieve a clean user-friendly error message
      let friendlyMessage = "Transaction failed. Check console for details.";
      if (err.code === 'ACTION_REJECTED' || (err.message && err.message.toLowerCase().includes("user rejected"))) {
        friendlyMessage = "Transaction was rejected in wallet.";
      } else if (err.message && err.message.toLowerCase().includes("insufficient funds")) {
        friendlyMessage = "Insufficient funds to execute transaction.";
      }
      setErrorMsg(friendlyMessage);
      throw err;
    }
  };

  const reset = () => {
    setTxStep('IDLE');
    setTxHash(null);
    setErrorMsg(null);
  };

  return { txStep, txHash, errorMsg, executeTx, reset };
}
