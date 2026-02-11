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
      <DialogBody className="bg-zinc-900 p-0">
        <div className="relative flex max-h-[90vh] min-h-[400px] w-full items-center justify-center">
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
            className="absolute top-4 right-4 z-10 rounded-full bg-white/90 p-2 shadow-lg hover:bg-white dark:bg-zinc-900/90 dark:hover:bg-zinc-900"
          >
            <XMarkIcon className="h-5 w-5" />
          </Button>
        </div>
      </DialogBody>
    </Dialog>
  );
}
