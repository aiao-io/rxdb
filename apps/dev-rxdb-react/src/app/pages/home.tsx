export default function HomePage() {
  const reactLogoSrc = `${import.meta.env.BASE_URL}react.svg`;

  return (
    <div className='hero bg-base-200 min-h-screen'>
      <div className='hero-content text-center'>
        <div className='max-w-md'>
          <h1 className='text-5xl font-bold'>Aiao RxDB</h1>
          <p className='py-6'>Local-first application with RxDB</p>

          <div className='card bg-base-100 w-full shadow-xl'>
            <div className='card-body items-center text-center'>
              <h2 className='card-title text-info text-3xl'>React</h2>
              <div className='my-4'>
                <img src={reactLogoSrc} alt='React' className='h-32 w-32' />
              </div>
              <p>Running on React</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
