@echo off
title Building Documentation
hugo.exe --source documentation --environment=production -v
del documentation\public\manifest.json