import { URLInputForm } from '../components/URLInputForm';

export function Home() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      <section id="submit" className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8 max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-neutral-800 dark:text-neutral-100 mb-3">
            Extract & Classify Assets
          </h2>
          <p className="text-neutral-600 dark:text-neutral-300">
            Paste a Google Drive folder or file link to extract and automatically classify all images and videos
          </p>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-8 shadow-xl border border-neutral-200 dark:border-neutral-800 mx-[1%] mb-8">
          <URLInputForm />
        </div>
      </section>
    </div>
  );
}
