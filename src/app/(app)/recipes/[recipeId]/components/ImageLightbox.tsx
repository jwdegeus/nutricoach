'use client';

import { Dialog, DialogBody } from '@/components/catalyst/dialog';
import { XMarkIcon } from '@heroicons/react/20/solid';
import { Button } from '@/components/catalyst/button';
import Image from 'next/image';

type ImageLightboxProps = {
  open: boolean;
  onClose: () => void;
  imageUrl: string;
  alt: string;
};

export function ImageLightbox({
  open,
  onClose,
  imageUrl,
  alt,
}: ImageLightboxProps) {
  return (
    <Dialog open={open} onClose={onClose} size="5xl">
      <DialogBody className="p-0 bg-zinc-900">
        <div className="relative flex items-center justify-center min-h-[400px] w-full max-h-[90vh]">
          <Image
            src={imageUrl}
            alt={alt}
            fill
            className="object-contain"
            sizes="100vw"
            unoptimized
          />
          <Button
            plain
            onClick={onClose}
            className="absolute top-4 right-4 bg-white/90 dark:bg-zinc-900/90 hover:bg-white dark:hover:bg-zinc-900 rounded-full p-2 shadow-lg z-10"
          >
            <XMarkIcon className="h-5 w-5" />
          </Button>
        </div>
      </DialogBody>
    </Dialog>
  );
}
