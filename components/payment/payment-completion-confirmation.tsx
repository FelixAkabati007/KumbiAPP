"use client";

import React from "react";
import { useEffect, useRef, useState } from "react";

export function usePaymentCompletionConfirmation(options?: {
  visibleMs?: number;
  fadeMs?: number;
}) {
  const visibleMs = options?.visibleMs ?? 2000;
  const fadeMs = options?.fadeMs ?? 300;
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [success, setSuccess] = useState(true);
  const [message, setMessage] = useState("Successful");
  const timeoutsRef = useRef<{
    show?: ReturnType<typeof setTimeout>;
    hide?: ReturnType<typeof setTimeout>;
    unmount?: ReturnType<typeof setTimeout>;
  }>({});

  useEffect(() => {
    return () => {
      if (timeoutsRef.current.show) clearTimeout(timeoutsRef.current.show);
      if (timeoutsRef.current.hide) clearTimeout(timeoutsRef.current.hide);
      if (timeoutsRef.current.unmount)
        clearTimeout(timeoutsRef.current.unmount);
    };
  }, []);

  const trigger = (isSuccess: boolean = true, msg: string = "Successful") => {
    if (timeoutsRef.current.show) clearTimeout(timeoutsRef.current.show);
    if (timeoutsRef.current.hide) clearTimeout(timeoutsRef.current.hide);
    if (timeoutsRef.current.unmount) clearTimeout(timeoutsRef.current.unmount);

    setSuccess(isSuccess);
    setMessage(msg);
    setMounted(true);
    setVisible(false);

    timeoutsRef.current.show = setTimeout(() => {
      setVisible(true);
    }, 0);

    const hideDelayMs = Math.max(0, visibleMs - fadeMs);
    timeoutsRef.current.hide = setTimeout(() => {
      setVisible(false);
      timeoutsRef.current.unmount = setTimeout(() => {
        setMounted(false);
      }, fadeMs);
    }, hideDelayMs);
  };

  return { mounted, visible, success, message, trigger };
}

export function PaymentCompletionConfirmation(props: {
  mounted: boolean;
  visible: boolean;
  success?: boolean;
  message?: string;
}) {
  if (!props.mounted) return null;

  // Default to success if undefined
  const isSuccess = props.success ?? true;
  const message = props.message || "Successful";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`khh-payment-confirmation ${!isSuccess ? "error" : ""}`}
      data-state={props.visible ? "visible" : "hidden"}
      style={!isSuccess ? { backgroundColor: "#ef4444" } : undefined}
    >
      {message}
    </div>
  );
}
