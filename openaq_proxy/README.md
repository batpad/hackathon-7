Simply proxy backend to query OpenAQ:

 - Reads OpenAQ key from the environment
 - Proxies queries to OpenAQ, injecting the key from the environment
 - Serves appropriate CORS headers so that it can be queried from client-side Javascript

This is setup on a small VPS server hosted with hetzner.de, with the domain name wastheinternetamistake.com pointing at it. 

The server is running Ubuntu 22.04, with nginx serving the PHP files. 

The PHP files are served from the root directory, with the cache directory in the same directory. 

The cache directory is not stored in git, as it is not needed on other machines. 

The environment variable for the OpenAQ key is set in /etc/php/8.3/fpm/pool.d/www.conf

