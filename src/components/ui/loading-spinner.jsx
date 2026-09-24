import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function LoadingSpinner({ className, size = "default" }) {
  const sizeClasses = {
    sm: "w-4 h-4",
    default: "w-6 h-6", 
    lg: "w-8 h-8"
  };

  return (
    <Loader2 
      className={cn(
        "animate-spin text-emerald-500", 
        sizeClasses[size], 
        className
      )} 
    />
  );
}

export function LoadingCard({ className }) {
  return (
    <div className={cn("glass-morphism border-gray-800 rounded-2xl p-6 flex items-center justify-center", className)}>
      <div className="flex items-center gap-3 text-gray-400">
        <LoadingSpinner />
        <span>Wird geladen...</span>
      </div>
    </div>
  );
}

export function LoadingState({ text = "Wird geladen..." }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="text-center">
        <LoadingSpinner size="lg" className="mb-4 mx-auto" />
        <p className="text-gray-400">{text}</p>
      </div>
    </div>
  );
}